/**
 * Add 14 purchase lines from old CSV that never imported (Pehnawa supplier).
 * Adds rows + stock movements only — no deletes. Updates invoice totals after.
 *
 *   DATABASE_URL=<production> npx ts-node --transpile-only scripts/backfill-pehnawa-missing-csv.ts
 *   ... --apply
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/prisma/client';
import { supplierBalances } from '../src/services/supplier-accounts.service';
import { parseBusinessDateTime } from '../src/utils/timezone';

const APPLY = process.argv.includes('--apply');
const MISSING_CSV = path.resolve(__dirname, '../../pehnawa-csv-not-in-db.csv');
const FULL_CSV = path.resolve(__dirname, '../../All pUrchase (3).csv');
const PEHNawa_SUPPLIER_ID = '7aff9df9-d3c0-4094-9a78-b08e87bda23e';

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

function parseMoney(s: string): number {
  return Number(String(s).replace(/,/g, '').replace(/"/g, '').trim()) || 0;
}

type Row = {
  legacy_purchase_id: string;
  purchase_date: Date;
  reference_no: string;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  purchase_amount: number;
  invoice_number: string;
};

function loadRows(): Row[] {
  const missText = fs.readFileSync(MISSING_CSV, 'utf8');
  const missLines = missText.split(/\r?\n/).filter(Boolean).slice(1);
  const fullText = fs.readFileSync(FULL_CSV, 'utf8');
  const fullLines = fullText.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(fullLines[0]);
  const ix = (n: string) => header.indexOf(n);

  const fullIndex = new Map<string, { legacyId: string; dateRaw: string }>();
  for (let i = 1; i < fullLines.length; i++) {
    const c = parseCsvLine(fullLines[i]);
    const ref = c[ix('reference_no')]?.trim() ?? '';
    const code = c[ix('product_code')]?.trim() ?? '';
    const name = c[ix('product_name')]?.trim() ?? '';
    const qty = parseMoney(c[ix('quantity')] ?? '0');
    const cost = parseMoney(c[ix('unit_cost')] ?? '0');
    const amt = parseMoney(c[ix('purchase_amount')] ?? '0');
    const key = `${ref}|${code}|${name}|${qty}|${cost}|${amt}`;
    fullIndex.set(key, {
      legacyId: c[ix('purchase_id')]?.trim() ?? '',
      dateRaw: c[ix('purchase_date')]?.trim() ?? '',
    });
  }

  const rows: Row[] = [];
  for (const line of missLines) {
    const c = parseCsvLine(line);
    const reference_no = c[0]?.trim() ?? '';
    const product_code = c[2]?.trim() ?? '';
    const product_name = c[3]?.replace(/^"|"$/g, '') ?? '';
    const quantity = parseMoney(c[4] ?? '0');
    const unit_cost = parseMoney(c[5] ?? '0');
    const purchase_amount = parseMoney(c[6] ?? '0');
    const key = `${reference_no}|${product_code}|${product_name}|${quantity}|${unit_cost}|${purchase_amount}`;
    const meta = fullIndex.get(key);
    if (!meta?.legacyId) {
      throw new Error(`Could not find legacy purchase_id for row: ${key}`);
    }
    const invoice_number = `${reference_no}#${meta.legacyId}`;
    rows.push({
      legacy_purchase_id: meta.legacyId,
      purchase_date: parseBusinessDateTime(meta.dateRaw),
      reference_no,
      product_code,
      product_name,
      quantity,
      unit_cost,
      purchase_amount,
      invoice_number,
    });
  }
  return rows;
}

async function resolveProduct(code: string, name: string): Promise<string> {
  if (code) {
    const byCode = await prisma.product.findFirst({
      where: {
        OR: [
          { custom_code: { equals: code, mode: 'insensitive' } },
          { sku: { equals: code, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (byCode) return byCode.id;
  }

  const needles = [
    name.slice(0, 48),
    name.includes('PA-100') ? 'PA-100' : '',
    name.includes('23644') ? '23644' : '',
    name.includes('Azure Dynasty') ? 'Azure Dynasty' : '',
    name.includes('Rosebud') ? 'Rosebud' : '',
    name.includes('A2504') ? 'A2504' : '',
    code === 'A2504-PA-114' ? 'A2504 PA-114' : '',
  ].filter(Boolean);

  for (const needle of needles) {
    const p = await prisma.product.findFirst({
      where: { name: { contains: needle, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    if (p) return p.id;
  }

  throw new Error(`Product not found for code="${code}" name="${name}"`);
}

async function invoiceTemplate(invoiceId: string) {
  const inv = await prisma.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    include: { purchases: { take: 1 } },
  });
  if (!inv?.purchases[0]) throw new Error(`No template purchase on invoice ${invoiceId}`);
  const t = inv.purchases[0];
  return {
    invoiceId: inv.id,
    warehouse_branch_id: t.warehouse_branch_id,
    created_by: t.created_by,
    bill_group_id: t.bill_group_id,
  };
}

async function main() {
  const rows = loadRows();
  const plan: Array<{
    row: Row;
    product_id: string;
    invoice_id: string;
    line_total: number;
  }> = [];

  for (const row of rows) {
    if (row.purchase_amount <= 0 && row.unit_cost <= 0) {
      console.log('Skip zero-value row:', row.product_name.slice(0, 40));
      continue;
    }
    const product_id = await resolveProduct(row.product_code, row.product_name);
    let invoice_number = row.invoice_number;
    if (row.reference_no === '0' && row.legacy_purchase_id === '107') {
      invoice_number = 'PO-LEGACY-107#107';
    }
    const inv = await prisma.purchaseInvoice.findFirst({
      where: { supplier_id: PEHNawa_SUPPLIER_ID, invoice_number },
      select: { id: true },
    });
    if (!inv) throw new Error(`Invoice not found: ${invoice_number}`);
    const dup = await prisma.purchase.findFirst({
      where: {
        supplier_id: PEHNawa_SUPPLIER_ID,
        purchase_invoice_id: inv.id,
        invoice_ref: row.reference_no,
        quantity: row.quantity,
        cost_price: row.unit_cost,
        OR: [{ product_id }, { notes: { contains: 'legacy_backfill=1' } }],
      },
      select: { id: true, notes: true },
    });
    if (dup) {
      console.log('Skip — already on invoice:', row.reference_no, row.product_name.slice(0, 36), row.purchase_amount);
      continue;
    }
    plan.push({
      row,
      product_id,
      invoice_id: inv.id,
      line_total: row.purchase_amount,
    });
  }

  const backupPath = path.resolve(
    __dirname,
    `../../pehnawa-backfill-plan-${new Date().toISOString().slice(0, 10)}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify({ apply: APPLY, plan }, null, 2), 'utf8');
  console.log(`Plan ${plan.length} lines, total Rs ${plan.reduce((s, p) => s + p.line_total, 0)}`);
  console.log('Backup:', backupPath);
  console.log(JSON.stringify(plan.map((p) => ({ inv: p.row.invoice_number, name: p.row.product_name.slice(0, 40), amt: p.line_total })), null, 2));

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to insert.');
    return;
  }

  const touchedInvoices = new Set<string>();

  await prisma.$transaction(
    async (tx) => {
      for (const p of plan) {
        const tpl = await invoiceTemplate(p.invoice_id);
        const sale = await tx.product.findUnique({
          where: { id: p.product_id },
          select: { sales_rate_inc_dis_and_tax: true },
        });
        const salePrice = Number(sale?.sales_rate_inc_dis_and_tax) || p.row.unit_cost;

        const purchase = await tx.purchase.create({
          data: {
            product_id: p.product_id,
            supplier_id: PEHNawa_SUPPLIER_ID,
            warehouse_branch_id: tpl.warehouse_branch_id,
            quantity: p.row.quantity,
            cost_price: p.row.unit_cost,
            sale_price: salePrice,
            purchase_date: p.row.purchase_date,
            invoice_ref: p.row.reference_no,
            bill_group_id: tpl.bill_group_id,
            notes: `legacy_backfill=1;legacy_purchase_id=${p.row.legacy_purchase_id};csv_missing=1`,
            delivery_status: 'COMPLETE',
            purchase_invoice_id: p.invoice_id,
            created_by: tpl.created_by,
          },
        });

        if (p.row.quantity > 0 && p.row.unit_cost >= 0) {
          let stock = await tx.stock.findUnique({
            where: {
              product_id_branch_id: {
                product_id: p.product_id,
                branch_id: tpl.warehouse_branch_id,
              },
            },
          });
          const prev = stock ? Number(stock.current_quantity) : 0;
          const next = prev + p.row.quantity;
          if (stock) {
            await tx.stock.update({
              where: {
                product_id_branch_id: {
                  product_id: p.product_id,
                  branch_id: tpl.warehouse_branch_id,
                },
              },
              data: { current_quantity: next },
            });
          } else {
            await tx.stock.create({
              data: {
                product_id: p.product_id,
                branch_id: tpl.warehouse_branch_id,
                current_quantity: next,
              },
            });
          }
          await tx.stockMovement.create({
            data: {
              product_id: p.product_id,
              branch_id: tpl.warehouse_branch_id,
              movement_type: 'PURCHASE',
              reference_id: purchase.id,
              reference_type: 'purchase',
              quantity_change: p.row.quantity,
              previous_qty: prev,
              new_qty: next,
              unit_cost: p.row.unit_cost,
              notes: 'Legacy CSV backfill (missing import)',
              created_by: tpl.created_by,
            },
          });
        }

        touchedInvoices.add(p.invoice_id);
      }

      for (const invoiceId of touchedInvoices) {
        const lines = await tx.purchase.findMany({
          where: { purchase_invoice_id: invoiceId },
          select: { quantity: true, cost_price: true },
        });
        const total = lines.reduce(
          (s, l) => s + Number(l.quantity) * Number(l.cost_price),
          0,
        );
        const inv = await tx.purchaseInvoice.findUnique({
          where: { id: invoiceId },
          select: { amount_paid: true },
        });
        const paid = Number(inv?.amount_paid ?? 0);
        let status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' = 'UNPAID';
        if (paid > 0.005) status = paid >= total - 0.005 ? 'PAID' : 'PARTIALLY_PAID';
        await tx.purchaseInvoice.update({
          where: { id: invoiceId },
          data: { total_amount: Math.round(total * 100) / 100, status },
        });
      }
    },
    { maxWait: 20000, timeout: 120000 },
  );

  const bal = (await supplierBalances([PEHNawa_SUPPLIER_ID])).get(PEHNawa_SUPPLIER_ID);
  console.log('\nPehnawa after backfill:', {
    totalPurchased: bal?.totalPurchased,
    balanceDue: bal?.balanceDue,
  });
  console.log('Backfill applied.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
