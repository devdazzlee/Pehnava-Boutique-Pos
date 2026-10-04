/**
 * Nudge customer AR residuals to match Customer Ledger final running balances.
 *   npx ts-node scripts/fix-legacy-customer-ar-nudge.ts --i-confirm-production
 */
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function read(name: string) {
  let s = fs.readFileSync(path.join(DATA, name), "utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return parse(s, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[];
}
function num(v: unknown) {
  return Number(String(v ?? "").replace(/,/g, "")) || 0;
}
function clean(v: unknown) {
  const s = String(v ?? "").trim();
  return !s || s.toUpperCase() === "NULL" ? "" : s;
}

async function main() {
  loadEnv();
  if (!process.argv.includes("--i-confirm-production")) throw new Error("Need --i-confirm-production");
  const url = process.env.PRODUCTION_DATABASE_URL || "";
  if (!url || url.includes("neon.tech")) throw new Error("PRODUCTION_DATABASE_URL required");

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const admin = await prisma.user.findFirst({ orderBy: { created_at: "asc" } });
    if (!admin) throw new Error("No admin");

    const cl = read("Customer Ledger.csv");
    const csvBal = new Map<string, number>();
    for (const r of cl) csvBal.set(clean(r.customer_id), num(r.running_balance));

    await prisma.customerPayment.deleteMany({ where: { notes: { contains: "legacy_balance_nudge=" } } });
    await prisma.customer.updateMany({
      where: { notes: { contains: "legacy_customer_id=" } },
      data: { previous_credit_balance: 0 },
    });

    const customers = await prisma.customer.findMany({ where: { notes: { contains: "legacy_customer_id=" } } });
    let openings = 0;
    let advances = 0;

    for (const c of customers) {
      const m = (c.notes || "").match(/(?:^|;\s*)legacy_customer_id=(\d+)(?:;|$)/);
      if (!m || !csvBal.has(m[1])) continue;
      const target = csvBal.get(m[1])!;

      const sales = await prisma.sale.findMany({
        where: { customer_id: c.id, status: "COMPLETED" },
        select: { total_amount: true, payment_received: true },
      });
      const rets = await prisma.sale.findMany({
        where: { customer_id: c.id, status: "REFUNDED" },
        select: { total_amount: true },
      });
      const pays = await prisma.customerPayment.findMany({
        where: { customer_id: c.id },
        select: { type: true, amount: true },
      });

      let due = 0;
      for (const s of sales) due += Number(s.total_amount) - Number(s.payment_received);
      for (const r of rets) due += Number(r.total_amount);
      for (const p of pays) {
        const amt = Number(p.amount);
        if (p.type === "REFUND" || p.type === "DEBIT_NOTE") due += amt;
        else due -= amt;
      }

      const diff = Math.round((target - due) * 100) / 100;
      if (Math.abs(diff) <= 5) continue;

      if (diff > 0) {
        await prisma.customer.update({ where: { id: c.id }, data: { previous_credit_balance: diff } });
        openings++;
        console.log("opening", m[1], diff);
      } else {
        await prisma.customerPayment.create({
          data: {
            customer_id: c.id,
            type: "ADVANCE",
            amount: Math.abs(diff),
            payment_date: new Date("2026-08-28T00:00:00"),
            method: "CASH",
            reference: "LEGACY-BAL",
            notes: `legacy_balance_nudge=${m[1]}`,
            created_by: admin.id,
          },
        });
        advances++;
        console.log("advance", m[1], diff);
      }
    }

    console.log({ openings, advances });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
