/**
 * Sync payment_received (+ fix 2 originals stuck as REFUNDED) from live export.
 * Closes ~Rs 17.43 paid gap vs old POS (cash rounded up on .50 totals).
 *
 *   npx ts-node --transpile-only scripts/fix-legacy-sales-paid-rounding.ts
 *   ... --apply
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, PaymentStatus, SaleStatus } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const LIVE = path.resolve(__dirname, '../../Previous Pos Data/live-export/sales-all.json');

function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function num(v: unknown) {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}
function clean(v: unknown) {
  return String(v ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function payStatus(raw: string, grand: number, paid: number): PaymentStatus {
  const s = raw.toLowerCase();
  if (s.includes('partial')) return PaymentStatus.PARTIAL;
  if (s.includes('due') || s.includes('pending') || s.includes('unpaid')) return PaymentStatus.PENDING;
  if (Math.abs(paid) + 0.01 >= Math.abs(grand) && Math.abs(grand) > 0) return PaymentStatus.PAID;
  if (Math.abs(paid) < 0.01) return PaymentStatus.PENDING;
  return PaymentStatus.PARTIAL;
}

async function main() {
  loadEnv();
  const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  const live = JSON.parse(fs.readFileSync(LIVE, 'utf8'));
  const rows = (live.aaData as unknown[][]).map((row) => ({
    id: clean(row[0]),
    status: clean(row[6]).toLowerCase(),
    grand: num(row[7]),
    paid: num(row[8]),
    payStatus: clean(row[10]),
    isReturn: clean(row[6]).toLowerCase() === 'returned' || num(row[7]) < 0,
  }));

  const db = await prisma.sale.findMany({
    where: {
      OR: [{ notes: { contains: 'legacy_sale_id=' } }, { notes: { contains: 'legacy_return_id=' } }],
    },
    select: {
      id: true,
      payment_received: true,
      payment_status: true,
      status: true,
      total_amount: true,
      notes: true,
      original_sale_id: true,
    },
  });

  const byLegacy = new Map<string, (typeof db)[0]>();
  for (const s of db) {
    const sm = (s.notes || '').match(/legacy_sale_id=(\d+)/);
    const rm = (s.notes || '').match(/legacy_return_id=(\d+)/);
    if (sm) byLegacy.set(sm[1], s);
    if (rm) byLegacy.set(rm[1], s);
  }

  type Fix = { id: string; legacyId: string; paid: number; status?: SaleStatus; payment_status: PaymentStatus };
  const fixes: Fix[] = [];

  for (const r of rows) {
    const doc = byLegacy.get(r.id);
    if (!doc) continue;
    const patch: Fix = {
      id: doc.id,
      legacyId: r.id,
      paid: r.paid,
      payment_status: r.isReturn ? PaymentStatus.PAID : payStatus(r.payStatus, r.grand, r.paid),
    };
    let need = Math.abs(Number(doc.payment_received) - r.paid) > 0.001;
    if (!r.isReturn && doc.status === SaleStatus.REFUNDED && !doc.original_sale_id) {
      patch.status = SaleStatus.COMPLETED;
      need = true;
    }
    if (doc.payment_status !== patch.payment_status) need = true;
    if (need) fixes.push(patch);
  }

  const paidDelta = fixes.reduce((s, f) => {
    const doc = db.find((d) => d.id === f.id)!;
    return s + (f.paid - Number(doc.payment_received));
  }, 0);

  console.log('Fixes:', fixes.length, 'paid delta', Math.round(paidDelta * 100) / 100);
  console.log(
    'Status REFUNDED→COMPLETED:',
    fixes.filter((f) => f.status === SaleStatus.COMPLETED).map((f) => f.legacyId),
  );

  if (!APPLY) {
    console.log('Dry run — re-run with --apply');
    await prisma.$disconnect();
    return;
  }

  for (const f of fixes) {
    const live = rows.find((r) => r.id === f.legacyId)!;
    await prisma.salePayment.deleteMany({ where: { sale_id: f.id } });
    if (!live.isReturn && f.paid > 0.005) {
      await prisma.salePayment.create({
        data: { sale_id: f.id, method: 'CASH', amount: f.paid },
      });
    }
    await prisma.sale.update({
      where: { id: f.id },
      data: {
        payment_received: f.paid,
        payment_status: f.payment_status,
        ...(f.status ? { status: f.status } : {}),
      },
    });
  }

  const after = await prisma.sale.findMany({
    where: {
      OR: [{ notes: { contains: 'legacy_sale_id=' } }, { notes: { contains: 'legacy_return_id=' } }],
    },
    select: { total_amount: true, payment_received: true },
  });
  console.log('After:', {
    n: after.length,
    grand: Math.round(after.reduce((s, r) => s + Number(r.total_amount), 0) * 100) / 100,
    paid: Math.round(after.reduce((s, r) => s + Number(r.payment_received), 0) * 100) / 100,
  });
  console.log('Old XLS: grand 6181179.49 paid 6162109.85');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
