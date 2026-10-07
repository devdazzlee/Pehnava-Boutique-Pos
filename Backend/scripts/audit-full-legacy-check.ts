/**
 * Full legacy vs new POS audit (sales, stock, purchases, employees, commissions, movements).
 *   npx ts-node scripts/audit-full-legacy-check.ts
 */
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";

const LIVE = path.resolve(__dirname, "../../Previous Pos Data/live-export");
const DATA = path.resolve(__dirname, "../../Previous Pos Data");

function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function readLive(name: string): unknown[][] {
  const json = JSON.parse(fs.readFileSync(path.join(LIVE, name), "utf8")) as { aaData: unknown[][] };
  return json.aaData || [];
}

async function main() {
  loadEnv();
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL } },
  });

  try {
    console.log("========== SALE HISTORY (critical) ==========\n");
    const liveRows = readLive("sales-all.json");
    const liveIds = new Set(liveRows.map((r) => clean(r[0])).filter(Boolean));

    const dbLegacy = await prisma.sale.findMany({
      where: { OR: [{ notes: { contains: "legacy_sale_id=" } }, { notes: { contains: "legacy_return_id=" } }] },
      select: { notes: true, total_amount: true, invoice_number: true, sale_date: true },
    });
    const byOld = new Map<string, (typeof dbLegacy)[0]>();
    const saleIds = new Set<string>();
    const returnIds = new Set<string>();
    for (const s of dbLegacy) {
      const sid = (s.notes || "").match(/legacy_sale_id=(\d+)/)?.[1];
      const rid = (s.notes || "").match(/legacy_return_id=(\d+)/)?.[1];
      if (sid) {
        saleIds.add(sid);
        byOld.set(sid, s);
      }
      if (rid) {
        returnIds.add(rid);
        byOld.set(rid, s);
      }
    }

    const missing = [...liveIds].filter((id) => !saleIds.has(id) && !returnIds.has(id));
    const mismatches: string[] = [];
    for (const row of liveRows) {
      const id = clean(row[0]);
      if (!id) continue;
      const s = byOld.get(id);
      if (!s) continue;
      const grand = num(row[7]) || num(row[8]);
      const isRet = clean(row[6]).toLowerCase() === "returned";
      const expect = isRet ? -Math.abs(grand) : Math.abs(grand);
      if (Math.abs(Number(s.total_amount) - expect) > 1.5) {
        mismatches.push(`${id} ref=${clean(row[2])} live=${expect} db=${Number(s.total_amount)}`);
      }
    }

    const newOnly = await prisma.sale.count({
      where: { NOT: { OR: [{ notes: { contains: "legacy_sale_id=" } }, { notes: { contains: "legacy_return_id=" } }] } },
    });
    const total = await prisma.sale.count();

    console.log(`Old POS sale/return documents (live):     ${liveIds.size}`);
    console.log(`Imported legacy_sale_id records:          ${saleIds.size}`);
    console.log(`Imported legacy_return_id records:        ${returnIds.size}`);
    console.log(`Missing old POS ids in new DB:            ${missing.length}`);
    console.log(`New POS sales (after migration):          ${newOnly}`);
    console.log(`Total rows in Sales History (DB):         ${total}`);
    console.log(`Amount mismatches (>Rs1.5):               ${mismatches.length}`);
    if (mismatches.length) console.log("  Sample:", mismatches.slice(0, 5).join("\n  "));

    console.log("\n========== STOCK ==========\n");
    let csvStock = 0;
    const csvPath = path.join(DATA, "Product List.csv");
    if (fs.existsSync(csvPath)) {
      let s = fs.readFileSync(csvPath, "utf8");
      if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
      const rows = parse(s, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
      csvStock = rows.reduce((sum, r) => sum + num(r.current_stock), 0);
    }
    const dbStock = Number((await prisma.stock.aggregate({ _sum: { current_quantity: true } }))._sum.current_quantity || 0);
    const legacyPurchLines = await prisma.purchase.count({ where: { notes: { contains: "legacy_purchase_id=" } } });
    const adjustments = await prisma.stockAdjustment.count();
    const movements = await prisma.stockMovement.groupBy({ by: ["movement_type"], _count: true });

    console.log(`Product List.csv stock sum (import ref):  ${csvStock}`);
    console.log(`Current DB stock units:                   ${dbStock}`);
    console.log(`Legacy purchase lines (stock IN):         ${legacyPurchLines}`);
    console.log(`Stock adjustment records in new POS:      ${adjustments} (old POS had ~6 via API)`);
    console.log("Stock movement audit rows:", movements.map((m) => `${m.movement_type}:${m._count}`).join(", ") || "none");
    console.log("Note: Legacy imported sales do not replay stock-OUT movements; qty came from product import.");

    console.log("\n========== EMPLOYEES & COMMISSIONS ==========\n");
    const employees = await prisma.employee.findMany({
      select: { name: true, employee_code: true, is_active: true, monthly_salary: true },
    });
    const commissions = await prisma.commission.findMany({
      select: { amount: true, month: true, year: true, is_paid: true, employee_id: true },
    });
    console.log(`Employees in new POS:                   ${employees.length}`);
    for (const e of employees) console.log(`  - ${e.name} (${e.employee_code}) active=${e.is_active}`);
    console.log(`Commission records in new POS:          ${commissions.length}`);
    console.log("Old POS paid commission history lived in Chart of Accounts (~Rs 31,150 total), not exported as rows.");
    console.log("No employee CSV was in Previous Pos Data — staff were set up fresh in new POS.");

    console.log("\n========== OTHER LIVE DATASETS ==========\n");
    const checks = [
      ["Customers", readLive("customers.json").length, await prisma.customer.count({ where: { notes: { contains: "legacy_customer_id=" } } })],
      ["Expenses", readLive("expenses.json").length, await prisma.expense.count({ where: { notes: { contains: "legacy_expense_id=" } } })],
      ["Products (live ids)", readLive("products.json").length, await prisma.product.count({ where: { description: { contains: "legacy_product_id=" } } })],
    ] as const;
    console.log("Dataset".padEnd(22), "Live", "Legacy in DB");
    for (const [name, live, db] of checks) console.log(name.padEnd(22), String(live).padStart(5), String(db).padStart(5));

    const okSales = missing.length === 0;
    console.log("\n========== VERDICT ==========");
    console.log(okSales ? "✓ All old POS sale/return documents are in new POS Sales History." : "✗ SALE GAPS — run import-previous-pos-delta.ts");
    if (missing.length) console.log("  Missing ids:", missing.join(", "));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
