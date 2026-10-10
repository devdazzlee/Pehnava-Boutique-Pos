/**
 * Align legacy sales/returns with old POS live export (same totals as sales XLS):
 *   Previous Pos Data/live-export/sales-all.json  → 497 rows, net Rs 6,181,179
 *
 * Fixes:
 * 1) 40 sales wrongly stored as returns (flip to sale, positive totals)
 * 2) payment_received / payment_status from live
 * 3) sale_date from live (Asia/Karachi)
 * 4) delete 3 extra legacy sales not in live export
 *
 *   npx ts-node --transpile-only scripts/fix-legacy-sales-from-live.ts
 *   ... --apply
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  PrismaClient,
  PaymentStatus,
  SaleStatus,
  SaleItemType,
} from '@prisma/client';
import { parseBusinessDateTime } from '../src/utils/timezone';

const APPLY = process.argv.includes('--apply');
const LIVE_PATH = path.resolve(__dirname, '../../Previous Pos Data/live-export/sales-all.json');

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
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

function payStatusFromLive(raw: string, grand: number, paid: number): PaymentStatus {
  const s = raw.toLowerCase();
  if (s.includes('partial')) return PaymentStatus.PARTIAL;
  if (s.includes('due') || s.includes('pending') || s.includes('unpaid')) return PaymentStatus.PENDING;
  if (Math.abs(paid) + 0.01 >= Math.abs(grand) && Math.abs(grand) > 0) return PaymentStatus.PAID;
  if (Math.abs(paid) < 0.01) return PaymentStatus.PENDING;
  return PaymentStatus.PARTIAL;
}

type LiveRow = {
  id: string;
  date: string;
  ref: string;
  customer: string;
  status: string;
  grand: number;
  paid: number;
  due: number;
  payStatus: string;
  returnOf: string;
  isReturn: boolean;
};

function loadLive(): LiveRow[] {
  const j = JSON.parse(fs.readFileSync(LIVE_PATH, 'utf8'));
  return (j.aaData as unknown[][]).map((row) => {
    const status = clean(row[6]).toLowerCase();
    const grand = num(row[7]);
    return {
      id: clean(row[0]),
      date: clean(row[1]),
      ref: clean(row[2]),
      customer: clean(row[4]),
      status,
      grand,
      paid: num(row[8]),
      due: num(row[9]),
      payStatus: clean(row[10]),
      returnOf: clean(row[12]),
      isReturn: status === 'returned' || grand < 0,
    };
  });
}

async function main() {
  loadEnv();
  const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  const live = loadLive();
  const liveById = new Map(live.map((r) => [r.id, r]));
  const liveSum = live.reduce((s, r) => s + r.grand, 0);
  const livePaid = live.reduce((s, r) => s + r.paid, 0);
  console.log('Live rows', live.length, 'grand', Math.round(liveSum), 'paid', Math.round(livePaid));
  console.log('Live sales', live.filter((r) => !r.isReturn).length, 'returns', live.filter((r) => r.isReturn).length);

  const db = await prisma.sale.findMany({
    where: {
      OR: [{ notes: { contains: 'legacy_sale_id=' } }, { notes: { contains: 'legacy_return_id=' } }],
    },
    include: {
      sale_items: { select: { id: true, quantity: true, line_total: true, item_type: true } },
      payments: { select: { id: true, amount: true } },
    },
  });

  type Plan = {
    id: string;
    legacyId: string;
    action: string;
    data: Record<string, unknown>;
    itemFlips?: string[];
    paymentFix?: { mode: 'set' | 'clear'; amount: number };
  };
  const plans: Plan[] = [];
  const deleteIds: Array<{ id: string; legacyId: string; reason: string }> = [];

  const byLegacy = new Map<string, (typeof db)[0]>();
  for (const s of db) {
    const sm = (s.notes || '').match(/legacy_sale_id=(\d+)/);
    const rm = (s.notes || '').match(/legacy_return_id=(\d+)/);
    if (sm) byLegacy.set(`s:${sm[1]}`, s);
    if (rm) byLegacy.set(`r:${rm[1]}`, s);
  }

  // Phantom returns: CSV import swapped IDs (legacy_return_id = live SALE id)
  // while live_delta already created the real sale. Delete the phantom.
  for (const s of db) {
    const rm = (s.notes || '').match(/legacy_return_id=(\d+)/);
    if (!rm) continue;
    const liveRow = liveById.get(rm[1]);
    if (liveRow && !liveRow.isReturn) {
      deleteIds.push({
        id: s.id,
        legacyId: rm[1],
        reason: 'phantom_return_id_is_live_sale',
      });
    }
  }

  for (const row of live) {
    const saleDoc = byLegacy.get(`s:${row.id}`);
    const retDoc = byLegacy.get(`r:${row.id}`);
    // Prefer the correctly typed document; ignore phantoms scheduled for delete
    const deleteSet = new Set(deleteIds.map((d) => d.id));
    const doc = row.isReturn
      ? retDoc && !deleteSet.has(retDoc.id)
        ? retDoc
        : saleDoc
      : saleDoc && !deleteSet.has(saleDoc.id)
        ? saleDoc
        : retDoc && !deleteSet.has(retDoc.id)
          ? retDoc
          : null;

    if (!doc) {
      console.warn('MISSING in DB (needs import):', row.id, row.ref, row.grand);
      continue;
    }

    const saleDate = parseBusinessDateTime(row.date);
    const patch: Record<string, unknown> = {};
    let paymentFix: Plan['paymentFix'];

    if (Math.abs(Number(doc.total_amount) - row.grand) > 0.5) {
      patch.total_amount = row.grand;
      patch.subtotal = row.grand;
    }
    if (Math.abs(Number(doc.payment_received) - row.paid) > 0.5) {
      patch.payment_received = row.paid;
      paymentFix = row.isReturn
        ? { mode: 'clear', amount: 0 }
        : { mode: 'set', amount: Math.max(0, row.paid) };
    }
    if (doc.sale_date.getTime() !== saleDate.getTime()) {
      patch.sale_date = saleDate;
    }
    const wantStatus = row.isReturn
      ? PaymentStatus.PAID
      : payStatusFromLive(row.payStatus, row.grand, row.paid);
    if (doc.payment_status !== wantStatus) patch.payment_status = wantStatus;

    // Ensure return linkage to original sale when live has returnOf
    if (row.isReturn) {
      const originalOld = row.returnOf && row.returnOf !== 'null' ? row.returnOf : null;
      if (originalOld) {
        const orig = byLegacy.get(`s:${originalOld}`);
        if (orig && doc.original_sale_id !== orig.id) {
          patch.original_sale_id = orig.id;
        }
      }
      if (doc.status !== SaleStatus.REFUNDED) patch.status = SaleStatus.REFUNDED;
    }

    if (Object.keys(patch).length || paymentFix) {
      plans.push({
        id: doc.id,
        legacyId: row.id,
        action: 'update',
        data: patch,
        paymentFix,
      });
    }
  }

  // Extra DB legacy rows whose id is not in live at all
  for (const s of db) {
    if (deleteIds.some((d) => d.id === s.id)) continue;
    const sm = (s.notes || '').match(/legacy_sale_id=(\d+)/);
    const rm = (s.notes || '').match(/legacy_return_id=(\d+)/);
    const lid = sm?.[1] || rm?.[1];
    if (!lid) continue;
    if (!liveById.has(lid)) {
      deleteIds.push({
        id: s.id,
        legacyId: lid,
        reason: sm ? 'extra_sale_not_in_live' : 'extra_return_not_in_live',
      });
    }
  }

  console.log('\nPlan updates:', plans.length);
  console.log(
    '  convert_return_to_sale',
    plans.filter((p) => p.action === 'convert_return_to_sale').length,
  );
  console.log(
    '  convert_sale_to_return',
    plans.filter((p) => p.action === 'convert_sale_to_return').length,
  );
  console.log('  update', plans.filter((p) => p.action === 'update').length);
  console.log('Deletes:', deleteIds.length, deleteIds);
  console.log(
    'Samples convert:',
    plans
      .filter((p) => p.action.startsWith('convert'))
      .slice(0, 5)
      .map((p) => ({ legacyId: p.legacyId, action: p.action, data: p.data })),
  );

  const reportPath = path.resolve(
    __dirname,
    `../../sales-legacy-fix-report-${new Date().toISOString().slice(0, 10)}.json`,
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        apply: APPLY,
        live: { rows: live.length, grand: Math.round(liveSum), paid: Math.round(livePaid) },
        plans: plans.map((p) => ({
          legacyId: p.legacyId,
          action: p.action,
          data: {
            ...p.data,
            sale_date:
              p.data.sale_date instanceof Date ? (p.data.sale_date as Date).toISOString() : p.data.sale_date,
          },
          paymentFix: p.paymentFix,
          itemFlipCount: p.itemFlips?.length ?? 0,
        })),
        deletes: deleteIds,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log('Report:', reportPath);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply');
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      for (const p of plans) {
        if (p.itemFlips?.length) {
          for (const itemId of p.itemFlips) {
            const item = await tx.saleItem.findUnique({ where: { id: itemId } });
            if (!item) continue;
            const qty = Number(item.quantity);
            const line = Number(item.line_total);
            if (p.action === 'convert_return_to_sale') {
              await tx.saleItem.update({
                where: { id: itemId },
                data: {
                  quantity: Math.abs(qty),
                  line_total: Math.abs(line),
                  item_type: SaleItemType.ORIGINAL,
                },
              });
            } else if (p.action === 'convert_sale_to_return') {
              await tx.saleItem.update({
                where: { id: itemId },
                data: {
                  quantity: -Math.abs(qty),
                  line_total: -Math.abs(line),
                  item_type: SaleItemType.RETURN,
                },
              });
            }
          }
        }

        if (p.paymentFix) {
          await tx.salePayment.deleteMany({ where: { sale_id: p.id } });
          if (p.paymentFix.mode === 'set' && Math.abs(p.paymentFix.amount) > 0.005) {
            await tx.salePayment.create({
              data: {
                sale_id: p.id,
                method: 'CASH',
                amount: Math.abs(p.paymentFix.amount),
              },
            });
          }
        }

        await tx.sale.update({
          where: { id: p.id },
          data: p.data as any,
        });
      }

      for (const d of deleteIds) {
        await tx.salePayment.deleteMany({ where: { sale_id: d.id } });
        await tx.saleItem.deleteMany({ where: { sale_id: d.id } });
        // customer payments / stock movements referencing this sale may exist — soft skip if FK fails
        try {
          await tx.sale.delete({ where: { id: d.id } });
        } catch (e) {
          console.warn('Could not delete', d.legacyId, (e as Error).message?.slice(0, 120));
        }
      }
    },
    { maxWait: 60000, timeout: 600000 },
  );

  const after = await prisma.sale.findMany({
    where: {
      OR: [{ notes: { contains: 'legacy_sale_id=' } }, { notes: { contains: 'legacy_return_id=' } }],
    },
    select: { total_amount: true, payment_received: true, notes: true, original_sale_id: true },
  });
  const sales = after.filter((s) => (s.notes || '').includes('legacy_sale_id='));
  const rets = after.filter((s) => (s.notes || '').includes('legacy_return_id='));
  console.log('\nAfter fix:', {
    sales: sales.length,
    returns: rets.length,
    total: after.length,
    grand: Math.round(after.reduce((s, e) => s + Number(e.total_amount), 0)),
    paid: Math.round(after.reduce((s, e) => s + Number(e.payment_received), 0)),
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
