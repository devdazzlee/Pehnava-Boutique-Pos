/**
 * Compare old POS expenses (live export + XLS + import CSV) — read-only.
 *   npx ts-node --transpile-only scripts/compare-legacy-expenses.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { prisma } from '../src/prisma/client';
import { parseBusinessDateTime, toBusinessYmd } from '../src/utils/timezone';

const DATA = path.resolve(__dirname, '../../Previous Pos Data');
const XLS = path.resolve(__dirname, '../../expenses_2026_10_09_20_48_09.xls');

function num(v: unknown): number {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function readExpenseCsv() {
  const text = fs.readFileSync(path.join(DATA, 'Expense Sheet.csv'), 'utf8').replace(/^\uFEFF/, '');
  return parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true, trim: true }) as Record<
    string,
    string
  >[];
}

function readLiveJson() {
  const j = JSON.parse(fs.readFileSync(path.join(DATA, 'live-export/expenses.json'), 'utf8'));
  return (j.aaData as unknown[][]).map((row) => ({
    expense_id: String(row[0]),
    expense_date: String(row[1]),
    reference: String(row[2] ?? ''),
    category: String(row[3] ?? ''),
    amount: num(row[4]),
    created_by: String(row[6] ?? ''),
  }));
}

function readXls() {
  const wb = XLSX.readFile(XLS);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  return rows.map((r) => ({
    expense_date: String(r.Date ?? ''),
    reference: String(r.Reference ?? ''),
    amount: num(r.Amount),
    created_by: String(r['Created by'] ?? ''),
  }));
}

async function main() {
  const csv = readExpenseCsv();
  const live = readLiveJson();
  const xls = readXls();

  const csvSum = csv.reduce((s, r) => s + num(r.amount), 0);
  const liveSum = live.reduce((s, r) => s + r.amount, 0);
  const xlsSum = xls.reduce((s, r) => s + r.amount, 0);

  console.log('Counts:', { csv: csv.length, live: live.length, xls: xls.length });
  console.log('Totals:', { csv: Math.round(csvSum), live: Math.round(liveSum), xls: Math.round(xlsSum) });

  const liveById = new Map(live.map((r) => [r.expense_id, r]));
  const csvById = new Map(csv.map((r) => [String(r.expense_id).trim(), r]));

  let dateCsvVsLive = 0;
  const dateSamples: object[] = [];
  for (const [id, c] of csvById) {
    const l = liveById.get(id);
    if (!l) continue;
    if (c.expense_date.trim() !== l.expense_date.trim()) {
      dateCsvVsLive++;
      if (dateSamples.length < 8) {
        dateSamples.push({
          id,
          import_csv: c.expense_date,
          live_old_pos: l.expense_date,
          amount: num(c.amount),
        });
      }
    }
  }
  console.log('\nSame expense_id but different timestamp (CSV import vs live old POS):', dateCsvVsLive);
  console.log(JSON.stringify(dateSamples, null, 2));

  const missingFromCsv = live.filter((l) => !csvById.has(l.expense_id));
  console.log('\nIn live export but NOT in Expense Sheet.csv:', missingFromCsv.length, 'sum', Math.round(missingFromCsv.reduce((s, r) => s + r.amount, 0)));
  if (missingFromCsv.length) console.log('Sample:', missingFromCsv.slice(0, 5));

  try {
    const legacy = await prisma.expense.findMany({
      where: { notes: { contains: 'legacy_expense_id=' } },
      select: { id: true, expense_date: true, amount: true, particular: true, notes: true },
    });
    const legacySum = legacy.reduce((s, e) => s + Number(e.amount), 0);
    console.log('\nDB legacy expenses:', legacy.length, 'sum', Math.round(legacySum));

    let dbDateWrongVsLive = 0;
    const dbSamples: object[] = [];
    for (const e of legacy) {
      const m = (e.notes || '').match(/legacy_expense_id=(\d+)/);
      if (!m) continue;
      const l = liveById.get(m[1]);
      if (!l) continue;
      const expected = parseBusinessDateTime(l.expense_date);
      const dbYmd = toBusinessYmd(e.expense_date);
      const liveYmd = toBusinessYmd(expected);
      if (dbYmd !== liveYmd) {
        dbDateWrongVsLive++;
        if (dbSamples.length < 8) {
          dbSamples.push({ id: m[1], live: l.expense_date, dbYmd, liveYmd, dbIso: e.expense_date.toISOString() });
        }
      }
    }
    console.log('DB business date != live export date:', dbDateWrongVsLive);
    console.log(JSON.stringify(dbSamples, null, 2));

    const liveIds = new Set(live.map((l) => l.expense_id));
    const missingInDb = live.filter((l) => {
      return !legacy.some((e) => (e.notes || '').includes(`legacy_expense_id=${l.expense_id}`));
    });
    console.log('\nLive expenses missing in DB:', missingInDb.length, 'sum', Math.round(missingInDb.reduce((s, r) => s + r.amount, 0)));
  } catch (err) {
    console.log('\n(DB skipped — tunnel not up)', (err as Error).message?.slice(0, 80));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
