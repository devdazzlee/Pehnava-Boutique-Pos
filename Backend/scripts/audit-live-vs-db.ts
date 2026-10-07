/**
 * Compare Previous Pos Data/live-export vs production DB legacy markers.
 *   npx ts-node scripts/audit-live-vs-db.ts
 */
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";

const LIVE = path.resolve(__dirname, "../../Previous Pos Data/live-export");

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function clean(v: unknown): string {
  const s = String(v ?? "").trim();
  return !s || s.toUpperCase() === "NULL" ? "" : s;
}

function readLive(name: string): unknown[][] {
  const file = path.join(LIVE, name);
  if (!fs.existsSync(file)) return [];
  const json = JSON.parse(fs.readFileSync(file, "utf8")) as { aaData: unknown[][] };
  return json.aaData || [];
}

function idsFromNotes(rows: { notes: string | null }[], re: RegExp): Set<string> {
  const s = new Set<string>();
  for (const r of rows) {
    const m = (r.notes || "").match(re);
    if (m) s.add(m[1]);
  }
  return s;
}

async function main() {
  loadEnv();
  const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL || "";
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const saleRows = readLive("sales-all.json");
    const liveSaleIds = new Set(saleRows.map((r) => clean(r[0])).filter(Boolean));

    const sales = await prisma.sale.findMany({
      where: { OR: [{ notes: { contains: "legacy_sale_id=" } }, { notes: { contains: "legacy_return_id=" } }] },
      select: { notes: true },
    });
    const dbSale = idsFromNotes(sales, /legacy_sale_id=(\d+)/);
    const dbRet = idsFromNotes(sales, /legacy_return_id=(\d+)/);
    const missingSales = [...liveSaleIds].filter((id) => !dbSale.has(id) && !dbRet.has(id));

    const liveCust = new Set(readLive("customers.json").map((r) => clean(r[0])).filter(Boolean));
    const dbCust = idsFromNotes(
      await prisma.customer.findMany({ where: { notes: { contains: "legacy_customer_id=" } }, select: { notes: true } }),
      /legacy_customer_id=(\d+)/,
    );
    const missingCust = [...liveCust].filter((id) => !dbCust.has(id));

    const liveProd = new Set(readLive("products.json").map((r) => clean(r[0])).filter(Boolean));
    const products = await prisma.product.findMany({ select: { description: true } });
    const dbProd = new Set<string>();
    for (const p of products) {
      const m = (p.description || "").match(/legacy_product_id=(\d+)/);
      if (m) dbProd.add(m[1]);
    }
    const missingProd = [...liveProd].filter((id) => !dbProd.has(id));

    const liveExp = new Set(readLive("expenses.json").map((r) => clean(r[0])).filter(Boolean));
    const dbExp = idsFromNotes(
      await prisma.expense.findMany({ where: { notes: { contains: "legacy_expense_id=" } }, select: { notes: true } }),
      /legacy_expense_id=(\d+)/,
    );
    const missingExp = [...liveExp].filter((id) => !dbExp.has(id));

    const livePurch = new Set(readLive("purchases.json").map((r) => clean(r[0])).filter(Boolean));
    const dbPurch = idsFromNotes(
      await prisma.purchaseInvoice.findMany({ where: { notes: { contains: "legacy_purchase_id=" } }, select: { notes: true } }),
      /legacy_purchase_id=(\d+)/,
    );
    const missingPurch = [...livePurch].filter((id) => !dbPurch.has(id));

    // Stock qty sum
    const stockSum = await prisma.stock.aggregate({ _sum: { current_quantity: true } });

    // CSV product list count for reference
    const csvProdPath = path.resolve(__dirname, "../../Previous Pos Data/Product List.csv");
    let csvProdLines = 0;
    if (fs.existsSync(csvProdPath)) {
      csvProdLines = fs.readFileSync(csvProdPath, "utf8").split(/\n/).filter((l) => l.trim()).length - 1;
    }

    console.log("=== LIVE EXPORT vs DB (legacy markers) ===\n");
    const rows = [
      ["Sales/returns (live rows)", liveSaleIds.size, dbSale.size + dbRet.size, missingSales.length],
      ["Customers", liveCust.size, dbCust.size, missingCust.length],
      ["Products (live list ids)", liveProd.size, dbProd.size, missingProd.length],
      ["Expenses", liveExp.size, dbExp.size, missingExp.length],
      ["Purchase headers", livePurch.size, dbPurch.size, missingPurch.length],
    ];
    console.log("Dataset".padEnd(28), "Live", "DB", "Missing");
    for (const [name, live, db, miss] of rows) {
      console.log(String(name).padEnd(28), String(live).padStart(5), String(db).padStart(5), String(miss).padStart(8));
    }
    console.log("\nStock units (DB sum):", stockSum._sum.current_quantity?.toString() ?? "0");
    console.log("Product List.csv lines (ref):", csvProdLines);

    if (missingSales.length) console.log("\nMissing sale ids (sample):", missingSales.slice(0, 25).join(", "));
    if (missingCust.length) console.log("Missing customer ids:", missingCust.join(", "));
    if (missingExp.length) console.log("Missing expense ids:", missingExp.join(", "));
    if (missingPurch.length) console.log("Missing purchase ids:", missingPurch.join(", "));
    if (missingProd.length) console.log("Missing product ids (sample):", missingProd.slice(0, 15).join(", "), missingProd.length > 15 ? `...+${missingProd.length - 15}` : "");

    const anyMissing = rows.some((r) => Number(r[3]) > 0);
    process.exit(anyMissing ? 2 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
