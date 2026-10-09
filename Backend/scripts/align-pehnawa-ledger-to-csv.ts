/**
 * Align Pehnawa legacy payable (invoiced stock) to old POS export:
 *   All pUrchase (3).csv — Pehnawa + Zainab-Pehnawa, 825 lines, Rs 9,494,716
 *
 * Removes duplicate / non-export invoiced lines, recalculates invoice headers,
 * optionally backfills CSV rows still missing from DB.
 *
 *   npx ts-node --transpile-only scripts/align-pehnawa-ledger-to-csv.ts
 *   ... --apply
 *   ... --apply --skip-backfill   (only remove extras + fix totals)
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/prisma/client';
import { supplierBalances } from '../src/services/supplier-accounts.service';
import { parseBusinessDateTime, toBusinessYmd } from '../src/utils/timezone';

const APPLY = process.argv.includes('--apply');
const SKIP_BACKFILL = process.argv.includes('--skip-backfill');
const PEHNawa_SUPPLIER_ID = '7aff9df9-d3c0-4094-9a78-b08e87bda23e';
const CSV_PATH = path.resolve(__dirname, '../../All pUrchase (3).csv');
const LEGACY_CUTOFF_YMD = '2026-10-03';
const CSV_TARGET = 9_494_716;

function parseMoney(s: string): number {
  return Number(String(s).replace(/,/g, '').replace(/"/g, '').trim()) || 0;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const c of line) {
    if (c === '"') {
      q = !q;
      continue;
    }
    if (c === ',' && !q) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

type CsvRow = {
  reference_no: string;
  supplier_name: string;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  purchase_amount: number;
  strictKey: string;
  looseKey: string;
};

function loadCsv(): CsvRow[] {
  const buf = fs.readFileSync(CSV_PATH);
  const text = buf.toString('latin1');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const idx = (n: string) => header.indexOf(n);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCsvLine(lines[i]);
    const supplier_name = c[idx('supplier_name')]?.trim() ?? '';
    if (!/^(Pehnawa|Zainab-Pehnawa)$/i.test(supplier_name)) continue;
    const reference_no = c[idx('reference_no')]?.trim() ?? '';
    const product_code = c[idx('product_code')]?.trim() ?? '';
    const product_name = c[idx('product_name')]?.trim() ?? '';
    const quantity = parseMoney(c[idx('quantity')] ?? '0');
    const unit_cost = parseMoney(c[idx('unit_cost')] ?? '0');
    const purchase_amount = parseMoney(c[idx('purchase_amount')] ?? '0');
    const strictKey = `${reference_no}|${product_code}|${quantity}|${unit_cost}|${purchase_amount}`;
    const looseKey = `${reference_no}|${quantity}|${unit_cost}|${purchase_amount}`;
    rows.push({
      reference_no,
      supplier_name,
      product_code,
      product_name,
      quantity,
      unit_cost,
      purchase_amount,
      strictKey,
      looseKey,
    });
  }
  return rows;
}

function purchaseKeys(p: {
  invoice_ref: string | null;
  quantity: unknown;
  cost_price: unknown;
  product: { sku: string | null; custom_code: string | null };
}): { strict: string[]; loose: string } {
  const ref = (p.invoice_ref || '').trim();
  const qty = Number(p.quantity);
  const cost = Number(p.cost_price);
  const amt = Math.round(qty * cost * 100) / 100;
  const loose = `${ref}|${qty}|${cost}|${amt}`;
  const codes = [p.product.custom_code, p.product.sku].filter(Boolean) as string[];
  const strict = (codes.length ? codes : ['']).map((code) => `${ref}|${code}|${qty}|${cost}|${amt}`);
  return { strict, loose };
}

function isBackfill(notes: string | null): boolean {
  return !!(notes || '').includes('legacy_backfill=1');
}

async function deletePurchaseLineTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  purchaseId: string,
  deletedBy: string,
) {
  const existing = await tx.purchase.findUnique({
    where: { id: purchaseId },
    include: { return_items: { select: { id: true } } },
  });
  if (!existing) return;
  if (existing.return_items.length > 0) {
    throw new Error(`Purchase ${purchaseId} has returns — skip manual cleanup first`);
  }

  const qty = Number(existing.quantity);
  const cost = Number(existing.cost_price);
  const stock = await tx.stock.findUnique({
    where: {
      product_id_branch_id: {
        product_id: existing.product_id,
        branch_id: existing.warehouse_branch_id,
      },
    },
  });
  const previousQty = stock ? Number(stock.current_quantity) : 0;
  const newStockQty = previousQty - qty;

  if (stock) {
    await tx.stock.update({
      where: {
        product_id_branch_id: {
          product_id: existing.product_id,
          branch_id: existing.warehouse_branch_id,
        },
      },
      data: { current_quantity: newStockQty },
    });
  }

  await tx.stockMovement.create({
    data: {
      product_id: existing.product_id,
      branch_id: existing.warehouse_branch_id,
      movement_type: 'ADJUSTMENT',
      reference_id: existing.id,
      reference_type: 'purchase_delete',
      quantity_change: -qty,
      previous_qty: previousQty,
      new_qty: newStockQty,
      unit_cost: cost,
      notes: 'Align Pehnawa ledger to old POS CSV export (remove duplicate/non-export line)',
      created_by: deletedBy,
    },
  });

  await tx.purchase.delete({ where: { id: existing.id } });
}

async function recalcInvoice(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], invoiceId: string) {
  const lines = await tx.purchase.findMany({
    where: { purchase_invoice_id: invoiceId },
    select: { quantity: true, cost_price: true },
  });
  const total = Math.round(lines.reduce((s, l) => s + Number(l.quantity) * Number(l.cost_price), 0) * 100) / 100;
  const inv = await tx.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    select: { amount_paid: true },
  });
  const paid = Number(inv?.amount_paid ?? 0);
  let status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' = 'UNPAID';
  if (paid > 0.005) status = paid >= total - 0.005 ? 'PAID' : 'PARTIALLY_PAID';
  await tx.purchaseInvoice.update({
    where: { id: invoiceId },
    data: { total_amount: total, status },
  });
}

async function main() {
  const csvRows = loadCsv();
  const csvTotal = csvRows.reduce((s, r) => s + r.purchase_amount, 0);
  if (Math.round(csvTotal) !== CSV_TARGET) {
    console.warn(`CSV total ${Math.round(csvTotal)} !== expected ${CSV_TARGET}`);
  }

  const strictToCsv = new Map<string, CsvRow>();
  const looseToCsv = new Map<string, CsvRow[]>();
  for (const r of csvRows) {
    strictToCsv.set(r.strictKey, r);
    const list = looseToCsv.get(r.looseKey) ?? [];
    list.push(r);
    looseToCsv.set(r.looseKey, list);
  }

  const purchases = await prisma.purchase.findMany({
    where: {
      supplier_id: PEHNawa_SUPPLIER_ID,
      purchase_invoice_id: { not: null },
    },
    include: {
      product: { select: { name: true, sku: true, custom_code: true } },
    },
    orderBy: { purchase_date: 'asc' },
  });

  const legacyInvoiced = purchases.filter((p) => toBusinessYmd(p.purchase_date) <= LEGACY_CUTOFF_YMD);

  type PurchaseRow = (typeof purchases)[0];

  function matchesCsvRow(p: PurchaseRow, row: CsvRow): 'strict' | 'loose' | null {
    const { strict, loose } = purchaseKeys(p);
    if (strict.includes(row.strictKey)) return 'strict';
    if (loose === row.looseKey) {
      if (
        p.product.name.toLowerCase().includes(row.product_name.slice(0, 20).toLowerCase()) ||
        row.product_name.toLowerCase().includes(p.product.name.slice(0, 20).toLowerCase())
      ) {
        return 'loose';
      }
      const bucket = looseToCsv.get(loose);
      if (bucket?.length === 1) return 'loose';
    }
    return null;
  }

  function rank(p: PurchaseRow, how: 'strict' | 'loose') {
    let s = how === 'strict' ? 10 : 5;
    if (isBackfill(p.notes)) s -= 4;
    if ((p.notes || '').includes('legacy_purchase_id=')) s += 1;
    return s;
  }

  const usedPurchaseIds = new Set<string>();
  const keep: PurchaseRow[] = [];
  const csvRowToPurchase = new Map<string, PurchaseRow>();

  for (const csvRow of csvRows) {
    const cands: Array<{ p: PurchaseRow; how: 'strict' | 'loose' }> = [];
    for (const p of legacyInvoiced) {
      if (usedPurchaseIds.has(p.id)) continue;
      const how = matchesCsvRow(p, csvRow);
      if (how) cands.push({ p, how });
    }
    if (!cands.length) continue;
    cands.sort((a, b) => rank(b.p, b.how) - rank(a.p, a.how));
    const pick = cands[0].p;
    usedPurchaseIds.add(pick.id);
    keep.push(pick);
    csvRowToPurchase.set(csvRow.strictKey, pick);
  }

  const remove = legacyInvoiced.filter((p) => !usedPurchaseIds.has(p.id));
  const missingCsv = csvRows.filter((r) => !csvRowToPurchase.has(r.strictKey));
  const keepTotal = keep.reduce((s, p) => s + Number(p.quantity) * Number(p.cost_price), 0);
  const removeTotal = remove.reduce((s, p) => s + Number(p.quantity) * Number(p.cost_price), 0);
  const missingTotal = missingCsv.reduce((s, r) => s + r.purchase_amount, 0);

  const invoices = await prisma.purchaseInvoice.findMany({
    where: { supplier_id: PEHNawa_SUPPLIER_ID },
    select: { total_amount: true },
  });
  const invoiceSumBefore = invoices.reduce((s, i) => s + Number(i.total_amount), 0);

  const report = {
    apply: APPLY,
    csv: { lines: csvRows.length, total: Math.round(csvTotal) },
    before: {
      invoiced_purchase_lines: legacyInvoiced.length,
      invoice_header_sum: Math.round(invoiceSumBefore),
    },
    plan: {
      keep_lines: keep.length,
      keep_amount: Math.round(keepTotal),
      remove_lines: remove.length,
      remove_amount: Math.round(removeTotal),
      missing_csv_lines: missingCsv.length,
      missing_amount: Math.round(missingTotal),
      expected_invoice_sum_after: Math.round(keepTotal + missingTotal),
      target: CSV_TARGET,
    },
    remove_samples: remove.slice(0, 25).map((p) => ({
      id: p.id,
      date: toBusinessYmd(p.purchase_date),
      ref: p.invoice_ref,
      product: p.product.name.slice(0, 50),
      amount: Math.round(Number(p.quantity) * Number(p.cost_price)),
      notes: (p.notes || '').slice(0, 80),
    })),
    missing_samples: missingCsv.slice(0, 15).map((r) => ({
      ref: r.reference_no,
      name: r.product_name.slice(0, 50),
      amount: r.purchase_amount,
    })),
    why_extra_vs_old_pos: [
      'Duplicate import / legacy_backfill lines that matched the same bill as an existing row',
      'Invoiced stock lines that are not in the old export (different product code or extra live import)',
      'After cleanup, legacy invoice total should match CSV Rs 9,494,716',
    ],
  };

  const reportPath = path.resolve(
    __dirname,
    `../../pehnawa-legacy-align-report-${new Date().toISOString().slice(0, 10)}.json`,
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report.plan, null, 2));
  console.log('Full report:', reportPath);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to delete extras and recalc invoices.');
    if (missingCsv.length && !SKIP_BACKFILL) {
      console.log('Then run: npx ts-node --transpile-only scripts/backfill-pehnawa-missing-csv.ts --apply');
    }
    return;
  }

  const touchedInvoices = new Set<string>();
  await prisma.$transaction(
    async (tx) => {
      for (const p of remove) {
        if (p.purchase_invoice_id) touchedInvoices.add(p.purchase_invoice_id);
        await deletePurchaseLineTx(tx, p.id, p.created_by);
      }
      for (const invoiceId of touchedInvoices) {
        await recalcInvoice(tx, invoiceId);
      }
    },
    { maxWait: 30000, timeout: 300000 },
  );

  if (missingCsv.length && !SKIP_BACKFILL) {
    const missPath = path.resolve(__dirname, '../../pehnawa-csv-not-in-db.csv');
    const hdr =
      'reference_no,supplier_name,product_code,product_name,quantity,unit_cost,purchase_amount\n';
    const body = missingCsv
      .map(
        (r) =>
          `${r.reference_no},${r.supplier_name},${r.product_code},"${r.product_name.replace(/"/g, '""')}",${r.quantity},${r.unit_cost},${r.purchase_amount}`,
      )
      .join('\n');
    fs.writeFileSync(missPath, hdr + body, 'utf8');
    console.log('\nWrote', missPath, '— run backfill:');
    console.log('  npx ts-node --transpile-only scripts/backfill-pehnawa-missing-csv.ts --apply');
  }

  const invAfter = await prisma.purchaseInvoice.findMany({
    where: { supplier_id: PEHNawa_SUPPLIER_ID },
    select: { total_amount: true },
  });
  const bal = (await supplierBalances([PEHNawa_SUPPLIER_ID])).get(PEHNawa_SUPPLIER_ID);
  console.log('\nAfter align (before optional backfill):', {
    invoice_header_sum: Math.round(invAfter.reduce((s, i) => s + Number(i.total_amount), 0)),
    totalPurchased: bal?.totalPurchased,
    balanceDue: bal?.balanceDue,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
