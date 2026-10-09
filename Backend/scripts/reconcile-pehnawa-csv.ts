/**
 * Compare old "All pUrchase" CSV vs production Pehnawa supplier ledger lines.
 * Usage (production tunnel):
 *   DATABASE_URL=... npx ts-node --transpile-only scripts/reconcile-pehnawa-csv.ts
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/prisma/client';

const CSV_PATH = path.resolve(__dirname, '../../All pUrchase (3).csv');
const PEHNawa_SUPPLIER_ID = '7aff9df9-d3c0-4094-9a78-b08e87bda23e';

function parseMoney(s: string): number {
  const n = Number(String(s).replace(/,/g, '').replace(/"/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

/** Minimal CSV row parser (handles quoted commas). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
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
  key: string;
};

function loadCsv(): CsvRow[] {
  const text = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const idx = (name: string) => header.indexOf(name);
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
    const key = `${reference_no}|${product_code}|${quantity}|${unit_cost}|${purchase_amount}`;
    rows.push({
      reference_no,
      supplier_name,
      product_code,
      product_name,
      quantity,
      unit_cost,
      purchase_amount,
      key,
    });
  }
  return rows;
}

function dbKey(p: {
  invoice_ref: string | null;
  quantity: unknown;
  cost_price: unknown;
  product: { sku: string | null; custom_code: string | null; name: string };
}): string[] {
  const qty = Number(p.quantity);
  const cost = Number(p.cost_price);
  const amt = Math.round(qty * cost * 100) / 100;
  const ref = (p.invoice_ref || '').trim();
  const codes = [p.product.custom_code, p.product.sku].filter(Boolean) as string[];
  const keys: string[] = [];
  for (const code of codes.length ? codes : ['']) {
    keys.push(`${ref}|${code}|${qty}|${cost}|${amt}`);
  }
  return keys;
}

async function main() {
  const csvRows = loadCsv();
  const csvTotal = csvRows.reduce((s, r) => s + r.purchase_amount, 0);
  const csvPehnawaOnly = csvRows.filter((r) => r.supplier_name === 'Pehnawa');
  const csvPehnawaTotal = csvPehnawaOnly.reduce((s, r) => s + r.purchase_amount, 0);

  const purchases = await prisma.purchase.findMany({
    where: { supplier_id: PEHNawa_SUPPLIER_ID },
    include: {
      product: { select: { name: true, sku: true, custom_code: true } },
    },
  });

  const dbKeySet = new Map<string, (typeof purchases)[0]>();
  for (const p of purchases) {
    for (const k of dbKey(p)) dbKeySet.set(k, p);
  }

  const unmatched: CsvRow[] = [];
  const matched: CsvRow[] = [];
  for (const row of csvRows) {
    if (dbKeySet.has(row.key)) matched.push(row);
    else unmatched.push(row);
  }

  const unmatchedTotal = unmatched.reduce((s, r) => s + r.purchase_amount, 0);
  const matchedTotal = matched.reduce((s, r) => s + r.purchase_amount, 0);

  // Purchases in DB with no CSV match (likely new stock-in after migration)
  const csvKeySet = new Set(csvRows.map((r) => r.key));
  const dbOnly: typeof purchases = [];
  for (const p of purchases) {
    const keys = dbKey(p);
    if (!keys.some((k) => csvKeySet.has(k))) dbOnly.push(p);
  }
  const dbOnlyTotal = dbOnly.reduce(
    (s, p) => s + Number(p.quantity) * Number(p.cost_price),
    0,
  );

  const uninvoiced = purchases.filter((p) => !p.purchase_invoice_id);
  const invoiced = purchases.filter((p) => p.purchase_invoice_id);
  const invs = await prisma.purchaseInvoice.findMany({
    where: { supplier_id: PEHNawa_SUPPLIER_ID },
    select: { total_amount: true },
  });
  const invoiceHeaderSum = invs.reduce((s, i) => s + Number(i.total_amount), 0);
  const lineSumInvoiced = invoiced.reduce(
    (s, p) => s + Number(p.quantity) * Number(p.cost_price),
    0,
  );
  const lineSumUninvoiced = uninvoiced.reduce(
    (s, p) => s + Number(p.quantity) * Number(p.cost_price),
    0,
  );

  console.log(
    JSON.stringify(
      {
        csv: {
          rows_pehnawa_and_zainab: csvRows.length,
          rows_pehnawa_only: csvPehnawaOnly.length,
          total_pehnawa_and_zainab: Math.round(csvTotal),
          total_pehnawa_only: Math.round(csvPehnawaTotal),
        },
        production_db_pehnawa: {
          purchase_lines: purchases.length,
          matched_to_csv_lines: matched.length,
          csv_lines_not_in_db: unmatched.length,
          csv_not_in_db_amount: Math.round(unmatchedTotal),
          db_lines_not_in_csv: dbOnly.length,
          db_not_in_csv_amount: Math.round(dbOnlyTotal),
        },
        why_pos_total_purchased_lower_than_old_sheet: {
          pos_shows_total_purchased: 6918516,
          sum_all_purchase_lines: Math.round(lineSumInvoiced + lineSumUninvoiced),
          uninvoiced_lines_sum: Math.round(lineSumUninvoiced),
          invoiced_lines_sum: Math.round(lineSumInvoiced),
          purchase_invoice_headers_sum: Math.round(invoiceHeaderSum),
          undercount_from_invoices: Math.round(lineSumInvoiced - invoiceHeaderSum),
          formula: 'ledger = uninvoiced lines + invoice header totals (not line sums when invoiced)',
        },
        top_unmatched_csv_samples: unmatched.slice(0, 15).map((r) => ({
          ref: r.reference_no,
          code: r.product_code,
          name: r.product_name.slice(0, 40),
          amount: r.purchase_amount,
        })),
      },
      null,
      2,
    ),
  );

  // Write full unmatched list for user
  const outPath = path.resolve(__dirname, '../../pehnawa-csv-not-in-db.csv');
  const hdr =
    'reference_no,supplier_name,product_code,product_name,quantity,unit_cost,purchase_amount\n';
  const body = unmatched
    .map(
      (r) =>
        `${r.reference_no},${r.supplier_name},${r.product_code},"${r.product_name.replace(/"/g, '""')}",${r.quantity},${r.unit_cost},${r.purchase_amount}`,
    )
    .join('\n');
  fs.writeFileSync(outPath, hdr + body, 'utf8');
  console.log('Wrote unmatched CSV rows to', outPath);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
