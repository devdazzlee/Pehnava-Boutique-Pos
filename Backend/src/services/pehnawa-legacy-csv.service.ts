import fs from 'fs';
import path from 'path';
import { prisma } from '../prisma/client';
import { toBusinessYmd } from '../utils/timezone';

export const LEGACY_CUTOFF_YMD = '2026-10-03';
export const LEGACY_PERIOD_FROM = '2026-08-28';
export const CSV_TARGET_TOTAL = 9_494_716;

export type LegacyCsvRow = {
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

export function resolveLegacyPurchaseCsvPath(): string | null {
  const candidates = [
    process.env.LEGACY_PURCHASE_CSV_PATH,
    path.resolve(__dirname, '../../data/legacy-all-purchase.csv'),
    path.resolve(process.cwd(), 'All pUrchase (3).csv'),
    path.resolve(process.cwd(), '../All pUrchase (3).csv'),
    path.resolve(process.cwd(), 'data/legacy-all-purchase.csv'),
    path.resolve(__dirname, '../../../All pUrchase (3).csv'),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function loadPehnawaFamilyCsv(): LegacyCsvRow[] {
  const csvPath = resolveLegacyPurchaseCsvPath();
  if (!csvPath) throw new Error('Legacy purchase CSV not found on server (All pUrchase (3).csv)');

  const buf = fs.readFileSync(csvPath);
  const text = buf.toString('latin1');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const idx = (n: string) => header.indexOf(n);
  const rows: LegacyCsvRow[] = [];
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

export async function getPehnawaLegacyExportReport(supplierId: string) {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true, code: true },
  });
  if (!supplier) return null;
  if (!/^pehnawa$/i.test(supplier.name.trim())) return null;

  const csvRows = loadPehnawaFamilyCsv();
  const csvTotal = csvRows.reduce((s, r) => s + r.purchase_amount, 0);

  const looseToCsv = new Map<string, LegacyCsvRow[]>();
  for (const r of csvRows) {
    const list = looseToCsv.get(r.looseKey) ?? [];
    list.push(r);
    looseToCsv.set(r.looseKey, list);
  }

  const purchases = await prisma.purchase.findMany({
    where: { supplier_id: supplierId, purchase_invoice_id: { not: null } },
    include: { product: { select: { name: true, sku: true, custom_code: true } } },
    orderBy: { purchase_date: 'asc' },
  });

  const legacyInvoiced = purchases.filter((p) => toBusinessYmd(p.purchase_date) <= LEGACY_CUTOFF_YMD);

  type PurchaseRow = (typeof purchases)[0];

  function matchesCsvRow(p: PurchaseRow, row: LegacyCsvRow): 'strict' | 'loose' | null {
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
  const matchedLines: Array<{
    reference_no: string;
    supplier_name: string;
    product_code: string;
    product_name: string;
    quantity: number;
    unit_cost: number;
    purchase_amount: number;
    in_pos: boolean;
    pos_product_name: string | null;
    match: 'strict' | 'loose' | null;
  }> = [];

  for (const csvRow of csvRows) {
    const cands: Array<{ p: PurchaseRow; how: 'strict' | 'loose' }> = [];
    for (const p of legacyInvoiced) {
      if (usedPurchaseIds.has(p.id)) continue;
      const how = matchesCsvRow(p, csvRow);
      if (how) cands.push({ p, how });
    }
    let pick: PurchaseRow | null = null;
    let how: 'strict' | 'loose' | null = null;
    if (cands.length) {
      cands.sort((a, b) => rank(b.p, b.how) - rank(a.p, a.how));
      pick = cands[0].p;
      how = cands[0].how;
      usedPurchaseIds.add(pick.id);
    }
    matchedLines.push({
      reference_no: csvRow.reference_no,
      supplier_name: csvRow.supplier_name,
      product_code: csvRow.product_code,
      product_name: csvRow.product_name,
      quantity: csvRow.quantity,
      unit_cost: csvRow.unit_cost,
      purchase_amount: csvRow.purchase_amount,
      in_pos: !!pick,
      pos_product_name: pick?.product.name ?? null,
      match: how,
    });
  }

  const extraInPos = legacyInvoiced
    .filter((p) => !usedPurchaseIds.has(p.id))
    .map((p) => ({
      date: toBusinessYmd(p.purchase_date),
      reference: p.invoice_ref,
      product: p.product.name,
      quantity: Number(p.quantity),
      unit_cost: Number(p.cost_price),
      amount: Math.round(Number(p.quantity) * Number(p.cost_price) * 100) / 100,
      notes: p.notes,
    }));

  const invoices = await prisma.purchaseInvoice.findMany({
    where: { supplier_id: supplierId },
    select: { total_amount: true },
  });
  const invoiceHeaderSum = invoices.reduce((s, i) => s + Number(i.total_amount), 0);

  const keepTotal = matchedLines.filter((l) => l.in_pos).reduce((s, l) => s + l.purchase_amount, 0);
  const extraTotal = extraInPos.reduce((s, l) => s + l.amount, 0);
  const missingLines = matchedLines.filter((l) => !l.in_pos);

  const removedAdjustments = await prisma.stockMovement.findMany({
    where: {
      notes: { contains: 'Align Pehnawa ledger to old POS CSV export' },
    },
    include: { product: { select: { name: true } } },
    orderBy: { created_at: 'asc' },
  });

  const removedDuplicates = removedAdjustments.map((m) => ({
    date: toBusinessYmd(m.created_at),
    product: m.product.name,
    quantity: Math.abs(Number(m.quantity_change)),
    unit_cost: Number(m.unit_cost),
    amount: Math.round(Math.abs(Number(m.quantity_change)) * Number(m.unit_cost) * 100) / 100,
  }));

  const removedTotal = removedDuplicates.reduce((s, r) => s + r.amount, 0);
  const aligned = Math.abs(invoiceHeaderSum - CSV_TARGET_TOTAL) < 1 && extraInPos.length === 0;

  return {
    supplier: { id: supplier.id, name: supplier.name, code: supplier.code },
    period: { from: LEGACY_PERIOD_FROM, to: LEGACY_CUTOFF_YMD },
    old_pos_export: {
      source: 'All pUrchase (3).csv (Pehnawa + Zainab-Pehnawa)',
      line_count: csvRows.length,
      total: Math.round(csvTotal),
    },
    current_pos: {
      legacy_invoice_total: Math.round(invoiceHeaderSum),
      matched_line_count: matchedLines.filter((l) => l.in_pos).length,
      matched_amount: Math.round(keepTotal),
      extra_duplicate_lines: extraInPos.length,
      extra_duplicate_amount: Math.round(extraTotal),
      missing_from_pos: missingLines.length,
      missing_amount: Math.round(missingLines.reduce((s, l) => s + l.purchase_amount, 0)),
      aligned_with_old_export: aligned,
    },
    cleanup: {
      removed_duplicate_lines: removedDuplicates.length,
      removed_duplicate_amount: Math.round(removedTotal),
      explanation: [
        'Duplicate import and legacy backfill rows that counted the same old POS stock twice.',
        'Extra lines on bills such as PO/2026/08/0010 where the same goods were already imported under product codes.',
      ],
    },
    export_rows: {
      old_pos_lines: matchedLines,
      removed_duplicates: removedDuplicates,
      still_extra_in_pos: extraInPos,
      still_missing_from_pos: missingLines.map((l) => ({
        reference_no: l.reference_no,
        supplier_name: l.supplier_name,
        product_name: l.product_name,
        purchase_amount: l.purchase_amount,
      })),
    },
  };
}
