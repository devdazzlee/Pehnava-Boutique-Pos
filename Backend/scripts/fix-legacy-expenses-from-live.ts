/**
 * Fix legacy expenses: dates/amounts from live old POS export (matches UI + XLS),
 * not Expense Sheet.csv (9h skew + 4 missing rows incl. Oct rent).
 *
 *   PRODUCTION_DATABASE_URL=... npx ts-node --transpile-only scripts/fix-legacy-expenses-from-live.ts
 *   ... --apply
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, ExpensePaymentMethod, ExpenseStatus } from '@prisma/client';
import { parseBusinessDateTime } from '../src/utils/timezone';

const APPLY = process.argv.includes('--apply');
const LIVE_PATH = path.resolve(__dirname, '../../Previous Pos Data/live-export/expenses.json');

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

function num(v: unknown): number {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function clean(v: unknown): string {
  return String(v ?? '').trim();
}

type LiveRow = {
  expense_id: string;
  expense_date: string;
  reference: string;
  category: string;
  amount: number;
  created_by: string;
};

function loadLive(): LiveRow[] {
  const j = JSON.parse(fs.readFileSync(LIVE_PATH, 'utf8'));
  return (j.aaData as unknown[][]).map((row) => ({
    expense_id: clean(row[0]),
    expense_date: clean(row[1]),
    reference: clean(row[2]),
    category: clean(row[3]) || 'Daily Expense',
    amount: num(row[4]),
    created_by: clean(row[6]),
  }));
}

async function main() {
  loadEnv();
  const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  const live = loadLive();
  const liveSum = live.reduce((s, r) => s + r.amount, 0);
  console.log('Live old POS expenses:', live.length, 'total Rs', Math.round(liveSum));

  const branch = await prisma.branch.findFirst({ where: { is_active: true }, select: { id: true } });
  if (!branch) throw new Error('No active branch');
  const admin = await prisma.user.findFirst({ where: { is_active: true }, select: { id: true }, orderBy: { created_at: 'asc' } });
  if (!admin) throw new Error('No user for created_by');

  const catCache = new Map<string, string>();
  async function categoryId(name: string) {
    const key = name || 'Daily Expense';
    if (catCache.has(key)) return catCache.get(key)!;
    let cat = await prisma.expenseCategory.findUnique({ where: { name: key } });
    if (!cat) {
      cat = await prisma.expenseCategory.create({
        data: { name: key, description: 'Legacy expense category', is_active: true },
      });
    }
    catCache.set(key, cat.id);
    return cat.id;
  }

  const legacy = await prisma.expense.findMany({
    where: { notes: { contains: 'legacy_expense_id=' } },
    select: { id: true, amount: true, expense_date: true, particular: true, notes: true, category_id: true },
  });

  const byLegacyId = new Map<string, (typeof legacy)[0]>();
  for (const e of legacy) {
    const m = (e.notes || '').match(/legacy_expense_id=(\d+)/);
    if (m) byLegacyId.set(m[1], e);
  }

  const updates: Array<{ id: string; legacyId: string; oldDate: Date; newDate: Date; oldAmt: number; newAmt: number }> = [];
  const creates: LiveRow[] = [];

  for (const row of live) {
    if (row.amount <= 0) continue;
    const existing = byLegacyId.get(row.expense_id);
    const expense_date = parseBusinessDateTime(row.expense_date);
    if (!existing) {
      creates.push(row);
      continue;
    }
    const oldAmt = Number(existing.amount);
    const dateChanged = existing.expense_date.getTime() !== expense_date.getTime();
    const amtChanged = Math.abs(oldAmt - row.amount) > 0.01;
    if (dateChanged || amtChanged) {
      updates.push({
        id: existing.id,
        legacyId: row.expense_id,
        oldDate: existing.expense_date,
        newDate: expense_date,
        oldAmt,
        newAmt: row.amount,
      });
    }
  }

  console.log('Plan: update', updates.length, 'create', creates.length);
  console.log('Update samples:', updates.slice(0, 5).map((u) => ({
    id: u.legacyId,
    was: u.oldDate.toISOString(),
    now: u.newDate.toISOString(),
    amount: u.newAmt,
  })));
  console.log('Create:', creates.map((c) => ({ id: c.expense_id, date: c.expense_date, ref: c.reference, amt: c.amount })));

  if (!APPLY) {
    console.log('\nDry run — re-run with --apply');
    await prisma.$disconnect();
    return;
  }

  for (const u of updates) {
    await prisma.expense.update({
      where: { id: u.id },
      data: {
        expense_date: u.newDate,
        approved_at: u.newDate,
        amount: u.newAmt,
      },
    });
  }

  for (const row of creates) {
    const expense_date = parseBusinessDateTime(row.expense_date);
    await prisma.expense.create({
      data: {
        particular: row.reference || row.category,
        amount: row.amount,
        category_id: await categoryId(row.category),
        expense_date,
        payment_method: ExpensePaymentMethod.CASH,
        reference: row.reference || null,
        notes: `legacy_expense_id=${row.expense_id};live_export_fix=1;created_by_name=${row.created_by}`,
        status: ExpenseStatus.APPROVED,
        approved_by: admin.id,
        approved_at: expense_date,
        branch_id: branch.id,
        created_by: admin.id,
      },
    });
  }

  const after = await prisma.expense.findMany({ where: { notes: { contains: 'legacy_expense_id=' } } });
  const afterSum = after.reduce((s, e) => s + Number(e.amount), 0);
  console.log('\nDone. Legacy expenses:', after.length, 'sum Rs', Math.round(afterSum));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
