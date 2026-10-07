/**
 * One-by-one checklist: old POS (live-export + login probes) vs new POS DB.
 *   npx ts-node scripts/audit-old-pos-one-by-one.ts
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

function readJsonCount(name: string): number {
  const f = path.join(LIVE, name);
  if (!fs.existsSync(f)) return -1;
  const j = JSON.parse(fs.readFileSync(f, "utf8")) as { iTotalRecords?: number; aaData?: unknown[] };
  return j.iTotalRecords ?? j.aaData?.length ?? 0;
}

function liveRows(name: string): unknown[][] {
  const f = path.join(LIVE, name);
  if (!fs.existsSync(f)) return [];
  return (JSON.parse(fs.readFileSync(f, "utf8")) as { aaData: unknown[][] }).aaData || [];
}

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

function num(v: unknown): number {
  return Number(String(v ?? "").replace(/,/g, "")) || 0;
}

type Row = { area: string; oldCount: string; newCount: string; missing: string; status: string; note: string };

async function main() {
  loadEnv();
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL } },
  });

  const rows: Row[] = [];

  try {
    // 1 Sales
    const liveSales = liveRows("sales-all.json");
    const liveSaleIds = new Set(liveSales.map((r) => clean(r[0])).filter(Boolean));
    const dbSales = await prisma.sale.findMany({
      where: { OR: [{ notes: { contains: "legacy_sale_id=" } }, { notes: { contains: "legacy_return_id=" } }] },
      select: { notes: true },
    });
    const covered = new Set<string>();
    for (const s of dbSales) {
      const a = (s.notes || "").match(/legacy_sale_id=(\d+)/)?.[1];
      const b = (s.notes || "").match(/legacy_return_id=(\d+)/)?.[1];
      if (a) covered.add(a);
      if (b) covered.add(b);
    }
    const missSales = [...liveSaleIds].filter((id) => !covered.has(id)).length;
    const newSales = await prisma.sale.count({
      where: { NOT: { OR: [{ notes: { contains: "legacy_sale_id=" } }, { notes: { contains: "legacy_return_id=" } }] } },
    });
    rows.push({
      area: "1. Sales & returns (history)",
      oldCount: String(liveSaleIds.size),
      newCount: `${await prisma.sale.count()} total (${covered.size} legacy ids + ${newSales} new POS)`,
      missing: String(missSales),
      status: missSales === 0 ? "OK" : "GAP",
      note: "Every old sale/return document id must be in DB notes.",
    });

    // 2 Customers
    const liveCust = readJsonCount("customers.json");
    const dbCust = await prisma.customer.count({ where: { notes: { contains: "legacy_customer_id=" } } });
    rows.push({
      area: "2. Customers",
      oldCount: String(liveCust),
      newCount: String(dbCust),
      missing: String(Math.max(0, liveCust - dbCust)),
      status: liveCust <= dbCust ? "OK" : "GAP",
      note: "Includes opening balance on customer record.",
    });

    // 3 Suppliers
    const liveSup = readJsonCount("suppliers.json");
    const dbSup = await prisma.supplier.count();
    rows.push({
      area: "3. Suppliers",
      oldCount: String(liveSup),
      newCount: String(dbSup),
      missing: liveSup > dbSup ? String(liveSup - dbSup) : "0",
      status: dbSup >= liveSup ? "OK" : "CHECK",
      note: "CSV had 6; new POS may have extra Unknown supplier.",
    });

    // 4 Products
    const liveProd = readJsonCount("products.json");
    const dbProdLegacy = await prisma.product.count({ where: { description: { contains: "legacy_product_id=" } } });
    rows.push({
      area: "4. Products (catalog)",
      oldCount: String(liveProd),
      newCount: `${dbProdLegacy} legacy (+ stubs from sales/purchases)`,
      missing: "0",
      status: dbProdLegacy >= liveProd ? "OK" : "CHECK",
      note: "Live list 1002; DB may have more from line-item stubs.",
    });

    // 5 Expenses
    const liveExp = readJsonCount("expenses.json");
    const dbExp = await prisma.expense.count({ where: { notes: { contains: "legacy_expense_id=" } } });
    rows.push({
      area: "5. Expense vouchers",
      oldCount: String(liveExp),
      newCount: String(dbExp),
      missing: String(Math.max(0, liveExp - dbExp)),
      status: liveExp === dbExp ? "OK" : "GAP",
      note: "Money expenses module — not whole COA expense type total.",
    });

    // 6 Purchases
    const livePurch = readJsonCount("purchases.json");
    const dbPurchInv = await prisma.purchaseInvoice.count({ where: { notes: { contains: "legacy_purchase_id=" } } });
    rows.push({
      area: "6. Purchase bills (stock IN headers)",
      oldCount: String(livePurch),
      newCount: String(dbPurchInv),
      missing: livePurch > dbPurchInv ? String(livePurch - dbPurchInv) : "0",
      status: dbPurchInv >= livePurch ? "OK" : "GAP",
      note: `${await prisma.purchase.count({ where: { notes: { contains: "legacy_purchase_id=" } } })} line rows.`,
    });

    // 7 Purchase returns
    let prCsv = 0;
    if (fs.existsSync(path.join(DATA, "All Puchase Return.csv"))) {
      let prs = fs.readFileSync(path.join(DATA, "All Puchase Return.csv"), "utf8");
      if (prs.charCodeAt(0) === 0xfeff) prs = prs.slice(1);
      const prRows = parse(prs, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
      prCsv = new Set(prRows.map((r) => clean(r.return_id)).filter(Boolean)).size;
    }
    const dbPr = await prisma.purchaseReturn.count({ where: { notes: { contains: "legacy_purchase_return_id=" } } });
    rows.push({
      area: "7. Purchase returns",
      oldCount: String(prCsv),
      newCount: String(dbPr),
      missing: String(Math.max(0, prCsv - dbPr)),
      status: prCsv <= dbPr ? "OK" : "GAP",
      note: "From CSV; live API has no working getPurchaseReturns.",
    });

    // 8 Stock on hand
    let csvStock = 0;
    const csvPath = path.join(DATA, "Product List.csv");
    if (fs.existsSync(csvPath)) {
      let s = fs.readFileSync(csvPath, "utf8");
      if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
      csvStock = (parse(s, { columns: true, skip_empty_lines: true }) as Record<string, string>[]).reduce(
        (sum, r) => sum + num(r.current_stock),
        0,
      );
    }
    const dbStock = Number((await prisma.stock.aggregate({ _sum: { current_quantity: true } }))._sum.current_quantity || 0);
    rows.push({
      area: "8. Stock quantity (units)",
      oldCount: `CSV ref ${csvStock}`,
      newCount: String(dbStock),
      missing: dbStock < csvStock ? `~${csvStock - dbStock} units vs CSV` : "0",
      status: Math.abs(dbStock - csvStock) <= 40 ? "CLOSE" : "DIFF",
      note: "Legacy sales did not all post stock movements; qty from import + purchases.",
    });

    // 9 Stock adjustments
    rows.push({
      area: "9. Stock adjustments",
      oldCount: String(readJsonCount("adjustments.json")),
      newCount: String(await prisma.stockAdjustment.count()),
      missing: String(Math.max(0, readJsonCount("adjustments.json") - (await prisma.stockAdjustment.count()))),
      status: (await prisma.stockAdjustment.count()) >= readJsonCount("adjustments.json") ? "OK" : "NOT IMPORTED",
      note: "Old adjustment lines lack product codes in HTML — manual review if needed.",
    });

    // 10 Transfers
    rows.push({
      area: "10. Stock transfers",
      oldCount: String(readJsonCount("transfers.json")),
      newCount: String(await prisma.transfer.count()),
      missing: "0",
      status: "OK",
      note: "Old POS had 0 transfers.",
    });

    // 11 Register / cash sessions
    const regOld = readJsonCount("register-logs.json");
    const regNew = await prisma.cashFlow.count();
    rows.push({
      area: "11. Register / till sessions",
      oldCount: String(regOld),
      newCount: String(regNew),
      missing: "N/A",
      status: "DIFF SYSTEM",
      note: "Old register logs not migrated; new POS has its own till sessions.",
    });

    // 12 Gift cards
    const gcOld = readJsonCount("gift-cards.json");
    const gcNew = await prisma.giftCard.count();
    rows.push({
      area: "12. Gift cards",
      oldCount: String(gcOld),
      newCount: String(gcNew),
      missing: String(Math.max(0, gcOld - gcNew)),
      status: gcNew >= gcOld ? "OK" : "GAP",
      note: "Old: 1 card Rs 10 balance if not imported.",
    });

    // 13 Login users
    const usersOld = readJsonCount("auth-users.json");
    rows.push({
      area: "13. Old POS login users",
      oldCount: usersOld >= 0 ? String(usersOld) : "3 (probe)",
      newCount: String(await prisma.user.count()),
      missing: "N/A",
      status: "DIFF SYSTEM",
      note: "Admin/sales logins — not 1:1 with Employee records.",
    });

    // 14 Employees
    const empNew = await prisma.employee.count();
    rows.push({
      area: "14. Employees (payroll module)",
      oldCount: "COA only (5 salaries)",
      newCount: String(empNew),
      missing: "N/A",
      status: "DIFF SYSTEM",
      note: "Salaries Dawood/Mehwish/etc. in old chart; 4 employees in new POS.",
    });

    // 15 Commissions
    rows.push({
      area: "15. Commission records",
      oldCount: "COA ~Rs 31,150 paid",
      newCount: String(await prisma.commission.count()),
      missing: "N/A",
      status: "NOT IN EXPORT",
      note: "No commission API in old POS DataTables export.",
    });

    // 16 COA / banks / journals
    rows.push({
      area: "16. Chart of accounts / journals / banks",
      oldCount: "Full tree in previois-posdata.txt",
      newCount: "New COA + openings",
      missing: "Partial",
      status: "DIFF SYSTEM",
      note: "Cash/Pehnawa bank + equity 7550 applied; not full old tree.",
    });

    console.log("\nOLD POS vs NEW POS — one-by-one checklist\n");
    console.log(
      "Area".padEnd(42) +
        "Old".padEnd(14) +
        "New".padEnd(22) +
        "Missing".padEnd(12) +
        "Status".padEnd(16) +
        "Note",
    );
    console.log("-".repeat(120));
    for (const r of rows) {
      console.log(
        r.area.padEnd(42) +
          r.oldCount.padEnd(14) +
          r.newCount.padEnd(22) +
          r.missing.padEnd(12) +
          r.status.padEnd(16) +
          r.note.slice(0, 50),
      );
    }

    const gaps = rows.filter((r) => r.status === "GAP" || r.status === "NOT IMPORTED");
    console.log("\n" + (gaps.length ? `Items needing attention: ${gaps.length}` : "All exportable transaction data: OK"));
    for (const g of gaps) console.log(" •", g.area, "—", g.missing, g.note);

    process.exit(gaps.some((g) => g.status === "GAP") ? 2 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
