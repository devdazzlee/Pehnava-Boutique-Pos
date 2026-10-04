/**
 * Fix legacy customer import: `contains` matched customer_id=20 to …=204 etc.
 * Creates missing customers and rewrites sale/return customer_id from CSVs.
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

function clean(v: unknown) {
  const s = String(v ?? "").trim();
  return !s || s.toUpperCase() === "NULL" ? "" : s;
}

function customerDisplayName(r: Record<string, string>) {
  const contact = clean(r.contact_person);
  const name = clean(r.name);
  const company = clean(r.company);
  if (contact && contact !== "0") return contact;
  if (name && name !== "0") return name;
  if (company && company !== "0") return company;
  return `Customer ${r.customer_id}`;
}

function extractLegacyId(notes: string | null): string | null {
  const m = (notes || "").match(/(?:^|;\s*)legacy_customer_id=(\d+)(?:;|$)/);
  return m ? m[1] : null;
}

async function main() {
  loadEnv();
  const url = process.env.PRODUCTION_DATABASE_URL;
  if (!url || url.includes("neon.tech")) throw new Error("PRODUCTION_DATABASE_URL required (not Neon)");
  if (!process.argv.includes("--i-confirm-production")) throw new Error("Need --i-confirm-production");

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const customers = read("Customer.csv");
    const sales = read("All Sales.csv");
    const returns = read("All Sales Return.csv");

    const map = new Map<string, string>();
    const existing = await prisma.customer.findMany({
      where: { notes: { contains: "legacy_customer_id=" } },
      select: { id: true, notes: true },
    });
    for (const c of existing) {
      const id = extractLegacyId(c.notes);
      if (id && !map.has(id)) map.set(id, c.id);
    }
    console.log("exact-mapped existing", map.size);

    let created = 0;
    for (const r of customers) {
      const oldId = clean(r.customer_id);
      if (!oldId || map.has(oldId)) continue;
      const phone = clean(r.phone) || null;
      const c = await prisma.customer.create({
        data: {
          name: customerDisplayName(r),
          phone_number: phone,
          mobile_number: phone,
          email: clean(r.email) || null,
          address: clean(r.address) || null,
          ntn: clean(r.nic_ntn) || null,
          is_active: true,
          customer_tags: ["legacy-import", clean(r.customer_group_name) || "General"],
          notes: `legacy_customer_id=${oldId}`,
          previous_credit_balance: 0,
        },
      });
      map.set(oldId, c.id);
      created++;
    }
    console.log("created missing", created, "total map", map.size);

    for (const [oldId, id] of map) {
      await prisma.customer.update({ where: { id }, data: { notes: `legacy_customer_id=${oldId}` } });
    }

    const saleCust = new Map<string, string>();
    for (const r of sales) {
      const qty = Number(r.quantity || 0);
      if (qty <= 0 || String(r.sale_status).toLowerCase() === "returned") continue;
      saleCust.set(clean(r.sale_id), clean(r.customer_id));
    }

    let saleFixed = 0;
    const legacySales = await prisma.sale.findMany({
      where: { notes: { contains: "legacy_sale_id=" } },
      select: { id: true, notes: true, customer_id: true },
    });
    for (const s of legacySales) {
      const m = (s.notes || "").match(/legacy_sale_id=(\d+)/);
      if (!m) continue;
      const oldCust = saleCust.get(m[1]);
      if (!oldCust) continue;
      const newCustId = map.get(oldCust) || null;
      if (newCustId !== s.customer_id) {
        await prisma.sale.update({ where: { id: s.id }, data: { customer_id: newCustId } });
        saleFixed++;
      }
    }
    console.log("sales customer links fixed", saleFixed);

    const retCust = new Map<string, string>();
    for (const r of returns) retCust.set(clean(r.return_id), clean(r.customer_id));

    let retFixed = 0;
    const legacyRets = await prisma.sale.findMany({
      where: { notes: { contains: "legacy_return_id=" } },
      select: { id: true, notes: true, customer_id: true },
    });
    for (const s of legacyRets) {
      const m = (s.notes || "").match(/legacy_return_id=(\d+)/);
      if (!m) continue;
      const oldCust = retCust.get(m[1]);
      if (!oldCust) continue;
      const newCustId = map.get(oldCust) || null;
      if (newCustId !== s.customer_id) {
        await prisma.sale.update({ where: { id: s.id }, data: { customer_id: newCustId } });
        retFixed++;
      }
    }
    console.log("return customer links fixed", retFixed);
    console.log("final customers", await prisma.customer.count());
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
