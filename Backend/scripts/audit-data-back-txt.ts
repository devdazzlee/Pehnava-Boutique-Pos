/**
 * Cross-check data-back.txt (old POS journal list) vs new POS transactions.
 * JVs are accounting shadows — we verify Sale/Expense/Purchase sources exist.
 *
 *   npx ts-node scripts/audit-data-back-txt.ts
 *   npx ts-node scripts/audit-data-back-txt.ts --import-missing-expenses --i-confirm-production
 */
import * as fs from "fs";
import * as path from "path";
import { PrismaClient, ExpensePaymentMethod, ExpenseStatus } from "@prisma/client";

const FILE = path.resolve(__dirname, "../../data-back.txt");
const SALE_REF = /SALE\/POS\/\d{4}\/\d{2}\/\d+/gi;

type JV = {
  voucher: string;
  date: string;
  type: string;
  narration: string;
  amount: number;
  status: string;
};

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

function parseFile(): JV[] {
  const text = fs.readFileSync(FILE, "utf8");
  const rows: JV[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("Voucher") || !t.startsWith("JV-")) continue;
    const parts = t.split("\t");
    if (parts.length < 6) continue;
    const amount = Number(parts[4].replace(/,/g, "")) || 0;
    rows.push({
      voucher: parts[0].trim(),
      date: parts[1].trim(),
      type: parts[2].trim(),
      narration: parts[3].trim(),
      amount,
      status: parts[5].trim().toUpperCase(),
    });
  }
  return rows;
}

function num(v: unknown) {
  return Number(v) || 0;
}

async function main() {
  loadEnv();
  if (!fs.existsSync(FILE)) throw new Error(`Missing ${FILE}`);

  const jvs = parseFile();
  const posted = jvs.filter((j) => j.status === "POSTED");
  const byType = new Map<string, number>();
  for (const j of jvs) byType.set(j.type, (byType.get(j.type) || 0) + 1);

  const saleRefs = new Map<string, { amount: number; type: string }>();
  for (const j of posted) {
    if (!j.type.startsWith("Sale")) continue;
    const refs = j.narration.match(SALE_REF);
    if (!refs) continue;
    for (const ref of refs) {
      const key = ref.toUpperCase();
      if (j.type === "Sale" || j.type === "Sale Return") {
        saleRefs.set(key, { amount: j.amount, type: j.type });
      }
    }
  }

  const expenseJvs = posted.filter((j) => j.type === "Expense");
  const purchaseJvs = posted.filter((j) => j.type === "Purchase");

  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL } },
  });

  try {
    const dbJv = await prisma.journalVoucher.count();
    const dbSales = await prisma.sale.findMany({
      select: { invoice_number: true, sale_number: true, total_amount: true, notes: true },
    });
    const invSet = new Set<string>();
    for (const s of dbSales) {
      if (s.invoice_number) invSet.add(s.invoice_number.toUpperCase());
      if (s.sale_number) invSet.add(s.sale_number.toUpperCase());
    }

    const missingSales: string[] = [];
    const foundSales: string[] = [];
    for (const [ref, meta] of saleRefs) {
      if (invSet.has(ref)) foundSales.push(ref);
      else missingSales.push(`${ref} (${meta.type} ${meta.amount})`);
    }

    // Expenses: match POSTED JV by date + amount (+ particular contains category name)
    const dbExp = await prisma.expense.findMany({
      where: { status: ExpenseStatus.APPROVED },
      select: { id: true, particular: true, amount: true, expense_date: true, notes: true },
    });
    const expKey = (d: Date, amt: number) => `${d.toISOString().slice(0, 10)}|${Math.round(amt * 100)}`;
    const dbExpKeys = new Set(dbExp.map((e) => expKey(e.expense_date, num(e.amount))));

    function dayDiff(a: string, b: Date) {
      const t = new Date(a + "T12:00:00").getTime();
      const u = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
      return Math.abs(t - u) / 86400000;
    }

    const missingExpenses: JV[] = [];
    for (const j of expenseJvs) {
      const cat = j.narration.replace(/^Expense:\s*/i, "").trim().toLowerCase();
      const matched = dbExp.some((e) => {
        if (Math.abs(num(e.amount) - j.amount) > 0.02) return false;
        if (dayDiff(j.date, e.expense_date) > 1) return false;
        const p = (e.particular || "").toLowerCase();
        if (j.amount >= 10000) return true; // rent / salary — amount+day is enough
        return (
          p.includes(cat.slice(0, 5)) ||
          cat.includes(p.slice(0, 5)) ||
          (cat.includes("food") && (p.includes("food") || p.includes("biryani") || p.includes("roll"))) ||
          (cat.includes("transport") && p.includes("transport")) ||
          (cat.includes("commission") && p.includes("com")) ||
          (cat.includes("salary") && p.includes("salary"))
        );
      });
      if (!matched) missingExpenses.push(j);
    }
    // dedupe missing by date+amount+narration
    const seenExp = new Set<string>();
    const missingExpUnique = missingExpenses.filter((j) => {
      const k = `${j.date}|${j.amount}|${j.narration}`;
      if (seenExp.has(k)) return false;
      seenExp.add(k);
      return true;
    });

    const importMissing =
      process.argv.includes("--import-missing-expenses") &&
      process.argv.includes("--i-confirm-production");

    if (importMissing && missingExpUnique.length) {
      const admin = await prisma.user.findFirst({ orderBy: { created_at: "asc" } });
      const branch = await prisma.branch.findFirst({ where: { is_active: true } });
      if (!admin || !branch) throw new Error("Need admin + branch");
      let catCache = new Map<string, string>();
      async function catId(name: string) {
        if (catCache.has(name)) return catCache.get(name)!;
        let c = await prisma.expenseCategory.findUnique({ where: { name } });
        if (!c) c = await prisma.expenseCategory.create({ data: { name, is_active: true } });
        catCache.set(name, c.id);
        return c.id;
      }
      let created = 0;
      for (const j of missingExpUnique) {
        const existsJv = await prisma.expense.findFirst({
          where: { notes: { contains: `legacy_jv=${j.voucher}` } },
        });
        if (existsJv) continue;
        const dup = await prisma.expense.findFirst({
          where: {
            amount: j.amount,
            expense_date: {
              gte: new Date(new Date(j.date + "T00:00:00").getTime() - 86400000),
              lte: new Date(new Date(j.date + "T23:59:59").getTime() + 86400000),
            },
          },
        });
        if (dup) continue;

        const cat = j.narration.replace(/^Expense:\s*/i, "").trim() || "Daily Expense";
        let catName = cat;
        if (cat.toLowerCase().startsWith("outlet")) catName = "Outlet Rent";
        else if (cat.toLowerCase().includes("utility")) catName = "Utility";
        else if (cat.toLowerCase().includes("commission")) catName = "COMMISSION EXP";
        else if (cat.toLowerCase().includes("salary")) catName = "Employees Salary";
        else if (cat.toLowerCase().includes("food")) catName = "food";
        else if (cat.toLowerCase().includes("transport")) catName = "transport";

        await prisma.expense.create({
          data: {
            particular: cat,
            amount: j.amount,
            category_id: await catId(catName),
            expense_date: new Date(j.date + "T12:00:00"),
            payment_method: ExpensePaymentMethod.CASH,
            notes: `legacy_jv=${j.voucher};data_back=1`,
            status: ExpenseStatus.APPROVED,
            approved_by: admin.id,
            approved_at: new Date(j.date + "T12:00:00"),
            branch_id: branch.id,
            created_by: admin.id,
          },
        });
        created++;
      }
      console.log("Imported expenses from data-back JVs:", created);
    }

    console.log("\n=== data-back.txt (old POS journal list) ===\n");
    console.log("Total JV lines:", jvs.length, "| POSTED:", posted.length, "| VOID/other:", jvs.length - posted.length);
    console.log("JV types:", [...byType.entries()].map(([k, v]) => `${k}:${v}`).join(", "));
    console.log("\nNew POS JournalVoucher records:", dbJv, "(new POS uses sales/expenses/purchases + optional manual JVs)");

    console.log("\n--- Sales referenced in POSTED JVs ---");
    console.log("Unique SALE/POS refs in JVs:", saleRefs.size);
    console.log("Found in new POS (invoice/sale #):", foundSales.length);
    console.log("Missing sale refs:", missingSales.length);
    if (missingSales.length) console.log("  Sample:", missingSales.slice(0, 15).join("\n  "));

    console.log("\n--- Expenses in POSTED JVs ---");
    console.log("Expense JV lines:", expenseJvs.length);
    console.log("Likely missing in Expenses module:", missingExpUnique.length);
    if (missingExpUnique.length) {
      console.log("  Sample:");
      for (const j of missingExpUnique.slice(0, 12)) {
        console.log(`    ${j.date} ${j.narration} ${j.amount} (${j.voucher})`);
      }
    }

    console.log("\n--- Purchases in POSTED JVs ---");
    console.log("Purchase JV lines:", purchaseJvs.length, "(accounting entries; stock IN = Purchase module)");

    console.log("\n=== VERDICT ===");
    if (missingSales.length === 0) {
      console.log("✓ Every SALE/POS invoice in data-back.txt exists in new POS Sales History.");
    } else {
      console.log("✗ Some sale refs from JVs missing — run delta import or check refs.");
    }
    console.log(
      "Journal rows themselves are NOT imported (would double-count with existing sales/expenses).",
    );

    process.exit(missingSales.length > 0 ? 2 : missingExpUnique.length > 0 ? 3 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
