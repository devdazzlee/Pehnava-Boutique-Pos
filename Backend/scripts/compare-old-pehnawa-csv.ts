/**
 * Compare old ERP purchase export vs POS (read-only).
 * Usage: npx ts-node --transpile-only scripts/compare-old-pehnawa-csv.ts "../../All pUrchase (3).csv"
 */
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../src/prisma/client';
import { supplierBalances } from '../src/services/supplier-accounts.service';

const OLD_SUPPLIER_NAMES = new Set(['pehnawa', 'zainab-pehnawa', 'zainab pehnawa']);

function parseMoney(s: string): number {
  const n = Number(String(s || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

type OldRow = {
  purchase_id: string;
  reference_no: string;
  supplier_name: string;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  purchase_amount: number;
};

function loadOldCsv(filePath: string): OldRow[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const idx = (name: string) => header.indexOf(name);

  const rows: OldRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCsvLine(lines[i]);
    const supplier = (c[idx('supplier_name')] || '').trim();
    if (!OLD_SUPPLIER_NAMES.has(supplier.toLowerCase())) continue;

    rows.push({
      purchase_id: c[idx('purchase_id')] || '',
      reference_no: c[idx('reference_no')] || '',
      supplier_name: supplier,
      product_code: c[idx('product_code')] || '',
      product_name: c[idx('product_name')] || '',
      quantity: parseMoney(c[idx('quantity')]),
      unit_cost: parseMoney(c[idx('unit_cost')]),
      purchase_amount: parseMoney(c[idx('purchase_amount')]),
    });
  }
  return rows;
}

async function main() {
  const csvArg = process.argv[2] || path.join(__dirname, '../../All pUrchase (3).csv');
  const oldRows = loadOldCsv(csvArg);

  const bySupplier = new Map<string, { lines: number; total: number }>();
  for (const r of oldRows) {
    const k = r.supplier_name;
    const b = bySupplier.get(k) || { lines: 0, total: 0 };
    b.lines += 1;
    b.total += r.purchase_amount > 0 ? r.purchase_amount : r.quantity * r.unit_cost;
    bySupplier.set(k, b);
  }

  let oldCombined = 0;
  let oldLines = 0;
  for (const [, v] of bySupplier) {
    oldCombined += v.total;
    oldLines += v.lines;
  }

  const suppliers = await prisma.supplier.findMany({
    where: {
      OR: [
        { name: { contains: 'Pehnawa', mode: 'insensitive' } },
        { name: { contains: 'Zainab', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true },
  });

  const bal = await supplierBalances(suppliers.map((s) => s.id));

  console.log('=== OLD CSV (Pehnawa + Zainab-Pehnawa) ===');
  for (const [name, v] of bySupplier) {
    console.log(`  ${name}: ${v.lines} lines, Rs ${Math.round(v.total).toLocaleString()}`);
  }
  console.log(`  COMBINED: ${oldLines} lines, Rs ${Math.round(oldCombined).toLocaleString()}`);

  console.log('\n=== NEW POS (connected DATABASE_URL) ===');
  let posCombined = 0;
  let posLines = 0;
  for (const s of suppliers) {
    const b = bal.get(s.id);
    const n = await prisma.purchase.count({
      where: { supplier_id: s.id, purchase_invoice_id: null },
    });
    posLines += n;
    posCombined += b?.totalPurchased ?? 0;
    console.log(
      `  ${s.name}: ${n} lines, purchased Rs ${(b?.totalPurchased ?? 0).toLocaleString()}, paid Rs ${(b?.totalPaid ?? 0).toLocaleString()}, owe Rs ${(b?.balanceDue ?? 0).toLocaleString()}`,
    );
  }
  console.log(`  COMBINED suppliers matched: ${posLines} lines, purchased Rs ${Math.round(posCombined).toLocaleString()}`);

  const gap = Math.round(oldCombined - posCombined);
  console.log('\n=== GAP (old combined − POS purchased on matched suppliers) ===');
  console.log(`  Rs ${gap.toLocaleString()} (${gap > 0 ? 'missing from POS vs old export' : 'POS higher than old CSV filter'})`);

  // Match heuristic: invoice_ref / notes contain old reference_no
  const posPurchases = await prisma.purchase.findMany({
    where: {
      supplier_id: { in: suppliers.map((s) => s.id) },
      purchase_invoice_id: null,
    },
    select: {
      id: true,
      invoice_ref: true,
      quantity: true,
      cost_price: true,
      notes: true,
      product: { select: { name: true, sku: true, label_barcode: true } },
    },
  });

  const refSet = new Set(oldRows.map((r) => r.reference_no.trim()).filter(Boolean));
  const posRefs = new Set(
    posPurchases.map((p) => (p.invoice_ref || '').trim()).filter(Boolean),
  );

  let matchedRefs = 0;
  for (const ref of refSet) {
    if (posRefs.has(ref)) matchedRefs++;
  }

  console.log('\n=== REFERENCE OVERLAP (invoice_ref in POS vs old reference_no) ===');
  console.log(`  Unique old refs (Pehnawa family): ${refSet.size}`);
  console.log(`  Unique POS invoice_ref on those suppliers: ${posRefs.size}`);
  console.log(`  Old refs found in POS: ${matchedRefs}`);

  // Sample unmatched old refs by total amount
  const byRef = new Map<string, number>();
  for (const r of oldRows) {
    const ref = r.reference_no.trim();
    if (!ref) continue;
    byRef.set(ref, (byRef.get(ref) || 0) + (r.purchase_amount || r.quantity * r.unit_cost));
  }
  const unmatchedRefs: Array<{ ref: string; total: number }> = [];
  for (const [ref, total] of byRef) {
    if (!posRefs.has(ref)) unmatchedRefs.push({ ref, total });
  }
  unmatchedRefs.sort((a, b) => b.total - a.total);

  console.log('\n=== TOP 15 OLD BILLS (reference_no) NOT IN POS invoice_ref ===');
  for (const u of unmatchedRefs.slice(0, 15)) {
    console.log(`  ${u.ref}: Rs ${Math.round(u.total).toLocaleString()}`);
  }

  const unmatchedTotal = unmatchedRefs.reduce((s, u) => s + u.total, 0);
  console.log(`\n  Sum of ALL unmatched old bill refs: Rs ${Math.round(unmatchedTotal).toLocaleString()}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
