/**
 * Fill remaining legacy gaps (safe: does not delete new POS data).
 *
 *   npx ts-node scripts/import-legacy-gap-fill.ts --i-confirm-production
 *   --dry-run
 */
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import {
  PrismaClient,
  PurchaseReturnStatus,
} from "@prisma/client";
import { ChartOfAccountsService } from "../src/services/chart-of-accounts.service";

const LIVE = path.resolve(__dirname, "../../Previous Pos Data/live-export");
const DATA = path.resolve(__dirname, "../../Previous Pos Data");
const DRY = process.argv.includes("--dry-run");
const LEGACY_EQUITY = 7_550;

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

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function readLive(name: string): unknown[][] {
  const file = path.join(LIVE, name);
  const json = JSON.parse(fs.readFileSync(file, "utf8")) as { aaData: unknown[][] };
  return json.aaData || [];
}

function readCsv(name: string): Record<string, string>[] {
  let s = fs.readFileSync(path.join(DATA, name), "utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return parse(s, { columns: true, skip_empty_lines: true, trim: true, bom: true });
}

async function main() {
  loadEnv();
  if (!process.argv.includes("--i-confirm-production") && !DRY) {
    throw new Error("Pass --i-confirm-production or --dry-run");
  }
  const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!url || url.includes("neon.tech")) throw new Error("Production DB URL required");

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const coa = new ChartOfAccountsService();
  const stats = { products: 0, stockRows: 0, purchaseReturns: 0, equity: 0, customers: 0 };

  try {
    const admin = await prisma.user.findFirst({ orderBy: { created_at: "asc" } });
    if (!admin) throw new Error("No admin user");
    const branch =
      (await prisma.branch.findFirst({ where: { is_active: true }, orderBy: { created_at: "asc" } })) ||
      (await prisma.branch.findFirst());
    if (!branch) throw new Error("No branch");

    const generalCat =
      (await prisma.category.findFirst({ where: { code: "LCAT-GENERAL" } })) ||
      (await prisma.category.findFirst());
    const unit =
      (await prisma.unit.findFirst({ where: { code: "PCS" } })) ||
      (await prisma.unit.create({ data: { code: "PCS", name: "Pcs", is_active: true, display_on_pos: true } }));

    const productByOldId = new Map<string, string>();
    for (const p of await prisma.product.findMany({ select: { id: true, description: true } })) {
      const m = (p.description || "").match(/legacy_product_id=(\d+)/);
      if (m) productByOldId.set(m[1], p.id);
    }

    // --- Missing products from live export ---
    for (const row of readLive("products.json")) {
      const oldId = clean(row[0]);
      if (!oldId || productByOldId.has(oldId)) continue;
      const code = clean(row[2]) || `LEG-${oldId}`;
      const name = clean(row[3]) || code;
      const cost = num(row[6]);
      const price = num(row[7]) || cost;
      const liveQty = num(row[11]);
      stats.products++;
      if (DRY) continue;

      let finalCode = code;
      if (await prisma.product.findUnique({ where: { code: finalCode } })) finalCode = `${code}-${oldId}`;

      const created = await prisma.product.create({
        data: {
          code: finalCode,
          sku: finalCode,
          name: name.slice(0, 250),
          unit_id: unit.id,
          category_id: generalCat?.id,
          purchase_rate: cost,
          sales_rate_exc_dis_and_tax: price,
          sales_rate_inc_dis_and_tax: price,
          is_active: true,
          display_on_pos: true,
          description: `legacy_product_id=${oldId}`,
        },
      });
      productByOldId.set(oldId, created.id);
      await prisma.stock.upsert({
        where: { product_id_branch_id: { product_id: created.id, branch_id: branch.id } },
        create: { product_id: created.id, branch_id: branch.id, current_quantity: liveQty },
        update: { current_quantity: liveQty },
      });
      console.log("Product", oldId, finalCode);
    }

    // --- Stock: raise legacy product qty when live > DB (never reduce — keeps new sales) ---
    for (const row of readLive("products.json")) {
      const oldId = clean(row[0]);
      const pid = productByOldId.get(oldId);
      if (!pid) continue;
      const liveQty = num(row[11]);
      if (liveQty <= 0) continue;
      const stock = await prisma.stock.findUnique({
        where: { product_id_branch_id: { product_id: pid, branch_id: branch.id } },
      });
      const cur = num(stock?.current_quantity);
      if (liveQty <= cur + 0.0001) continue;
      stats.stockRows++;
      if (DRY) continue;
      await prisma.stock.upsert({
        where: { product_id_branch_id: { product_id: pid, branch_id: branch.id } },
        create: { product_id: pid, branch_id: branch.id, current_quantity: liveQty },
        update: { current_quantity: liveQty },
      });
    }

    // --- Customer opening balances from live ---
    for (const row of readLive("customers.json")) {
      const oldId = clean(row[0]);
      const opening = num(row[8]);
      const cust = await prisma.customer.findFirst({
        where: { notes: { contains: `legacy_customer_id=${oldId}` } },
        select: { id: true, previous_credit_balance: true },
      });
      if (!cust || Math.abs(num(cust.previous_credit_balance) - opening) < 0.01) continue;
      stats.customers++;
      if (DRY) continue;
      await prisma.customer.update({ where: { id: cust.id }, data: { previous_credit_balance: opening } });
    }

    // --- Purchase return from CSV (only if missing) ---
    const prRows = readCsv("All Puchase Return.csv");
    const supplierMap = new Map<string, string>();
    for (const s of await prisma.supplier.findMany({ select: { id: true, notes: true } })) {
      const m = (s.notes || "").match(/Legacy supplier_id=(\d+)/i) || (s.notes || "").match(/supplier_id=(\d+)/);
      if (m) supplierMap.set(m[1], s.id);
    }
    for (const s of readCsv("Suppliers.csv")) {
      const oldId = clean(s.supplier_id);
      if (!oldId || supplierMap.has(oldId)) continue;
      const name = clean(s.supplier_name) || `Supplier ${oldId}`;
      if (DRY) continue;
      const code = `SUP-${oldId}`;
      const sup = await prisma.supplier.upsert({
        where: { code },
        create: { code, name, is_active: true, display_on_pos: true, notes: `Legacy supplier_id=${oldId}` },
        update: {},
      });
      supplierMap.set(oldId, sup.id);
    }

    async function ensureProductByOld(oldId: string, code: string, name: string, cost: number) {
      if (productByOldId.has(oldId)) return productByOldId.get(oldId)!;
      const byCode = await prisma.product.findFirst({ where: { code } });
      if (byCode) return byCode.id;
      return null;
    }

    for (const r of prRows) {
      const oldReturnId = clean(r.return_id);
      if (!oldReturnId) continue;
      const exists = await prisma.purchaseReturn.findFirst({
        where: { notes: { contains: `legacy_purchase_return_id=${oldReturnId}` } },
      });
      if (exists) continue;
      const supplierId = supplierMap.get(clean(r.supplier_id));
      if (!supplierId) {
        console.warn("Skip PR", oldReturnId, "no supplier", r.supplier_id);
        continue;
      }
      const productId = await ensureProductByOld(
        clean(r.product_id),
        clean(r.product_code),
        clean(r.product_name),
        num(r.net_unit_cost),
      );
      if (!productId) {
        console.warn("Skip PR", oldReturnId, "no product", r.product_id);
        continue;
      }
      const qty = Math.abs(num(r.return_quantity));
      const unitCost = num(r.net_unit_cost || r.unit_cost);
      const total = qty * unitCost;
      stats.purchaseReturns++;
      if (DRY) continue;
      await prisma.purchaseReturn.create({
        data: {
          return_number: `PR-LEGACY-${oldReturnId}`,
          supplier_id: supplierId,
          branch_id: branch.id,
          return_date: new Date(clean(r.return_date).replace(" ", "T")),
          status: PurchaseReturnStatus.COMPLETED,
          reason: clean(r.return_reference) || "Legacy purchase return",
          notes: `legacy_purchase_return_id=${oldReturnId};original_purchase_id=${clean(r.original_purchase_id)};gap_fill=1`,
          total_amount: total,
          created_by: admin.id,
          items: {
            create: [{ product_id: productId, quantity: qty, unit_cost: unitCost, total_cost: total }],
          },
        },
      });
      console.log("Purchase return", oldReturnId);
    }

    // --- Legacy equity opening (Owner's Capital) ---
    const owner = await prisma.transactionalAccount.findFirst({ where: { system_key: "OWNER_CAPITAL" } });
    if (owner && Math.abs(num(owner.opening_balance) - LEGACY_EQUITY) > 0.01) {
      stats.equity++;
      if (!DRY) {
        await coa.updateAccount(owner.id, {
          opening_balance: LEGACY_EQUITY,
          opening_side: "CREDIT",
          notes: "legacy_equity_opening=7550;gap_fill=1",
        });
      }
    }

    // --- Gift card from live export (single legacy card) ---
    const gcFile = path.join(LIVE, "gift-cards.json");
    if (fs.existsSync(gcFile)) {
      const gcRows = (JSON.parse(fs.readFileSync(gcFile, "utf8")) as { aaData: unknown[][] }).aaData || [];
      for (const row of gcRows) {
        const oldId = clean(row[0]);
        const code = clean(row[1]);
        const balance = num(row[3]) || num(row[2]);
        if (!code) continue;
        const exists = await prisma.giftCard.findFirst({
          where: { OR: [{ code }, { notes: { contains: `legacy_gift_card_id=${oldId}` } }] },
        });
        if (exists) continue;
        if (DRY) {
          console.log("Would import gift card", code, balance);
          continue;
        }
        const walkIn = await prisma.customer.findFirst({
          where: { name: { contains: "Walk-in", mode: "insensitive" } },
        });
        await prisma.giftCard.create({
          data: {
            code,
            initial_value: balance,
            balance,
            status: balance > 0 ? "ACTIVE" : "USED",
            customer_id: walkIn?.id,
            holder_name: clean(row[5]) || "Walk-in Customer",
            notes: `legacy_gift_card_id=${oldId};gap_fill=1`,
            branch_id: branch.id,
            created_by: admin.id,
          },
        });
        console.log("Gift card imported", code);
      }
    }

    if (!DRY) await coa.syncLinkedAccounts().catch(() => undefined);

    const stockSum = await prisma.stock.aggregate({ _sum: { current_quantity: true } });
    console.log(DRY ? "DRY RUN stats:" : "Gap fill complete:", stats);
    console.log("Stock units sum:", stockSum._sum.current_quantity?.toString());
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
