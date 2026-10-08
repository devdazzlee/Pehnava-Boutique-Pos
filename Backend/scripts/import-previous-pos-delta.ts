/**
 * Import missing legacy rows from Previous Pos Data/live-export/ into production.
 *
 *   PRODUCTION_DATABASE_URL=... \
 *   OLD_POS_IDENTITY=... OLD_POS_PASSWORD=... \
 *     npx ts-node scripts/import-previous-pos-delta.ts --i-confirm-production
 *
 * Optional: --dry-run (no writes)
 */
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import {
  ExpensePaymentMethod,
  ExpenseStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  PurchaseDeliveryStatus,
  PurchaseInvoiceStatus,
  SaleItemType,
  SaleStatus,
} from "@prisma/client";
import { ChartOfAccountsService } from "../src/services/chart-of-accounts.service";
import { parseBusinessDateTime } from "../src/utils/timezone";

const LIVE_DIR = path.resolve(__dirname, "../../Previous Pos Data/live-export");
const BASE = (process.env.OLD_POS_URL || "https://pehnawa.bytescentral.com").replace(/\/$/, "");
const DRY = process.argv.includes("--dry-run");

function loadEnvFile() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function clean(v: unknown): string {
  const s = String(v ?? "").trim();
  return !s || s.toUpperCase() === "NULL" ? "" : s;
}

function parseDate(raw: string): Date {
  return parseBusinessDateTime(clean(raw));
}

function readLiveJson(name: string): unknown[][] {
  const file = path.join(LIVE_DIR, name);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file} — run export-previous-pos-live.ts first`);
  const json = JSON.parse(fs.readFileSync(file, "utf8")) as { aaData: unknown[][] };
  return json.aaData || [];
}

class OldPosClient {
  private map = new Map<string, string>();

  private ingest(raw: string | null) {
    if (!raw) return;
    for (const part of raw.split(/,(?=\s*[^;]+=)/)) {
      const seg = part.split(";")[0]?.trim();
      const i = seg.indexOf("=");
      if (i < 0) continue;
      this.map.set(seg.slice(0, i).trim(), seg.slice(i + 1).trim());
    }
  }

  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async login(identity: string, password: string) {
    const loginHtml = await (await this.http(`${BASE}/login`)).text();
    const token = loginHtml.match(/name="token"\s+value="([^"]+)"/)?.[1];
    if (!token) throw new Error("Old POS login token missing");
    await this.http(`${BASE}/auth/login`, {
      method: "POST",
      body: new URLSearchParams({ token, identity, password, remember: "1" }),
    });
    if (!this.header().includes("sess=")) throw new Error("Old POS login failed");
  }

  private async http(url: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers as HeadersInit);
    const cookie = this.header();
    if (cookie) headers.set("cookie", cookie);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/x-www-form-urlencoded");
    }
    const res = await fetch(url, { ...init, headers });
    this.ingest(res.headers.get("set-cookie"));
    return res;
  }

  async saleView(legacyId: string): Promise<string> {
    const res = await this.http(`${BASE}/sales/view/${legacyId}`);
    return res.text();
  }

  async purchaseView(legacyId: string): Promise<string> {
    const res = await this.http(`${BASE}/purchases/view/${legacyId}`);
    return res.text();
  }
}

export function parseSaleItemsFromView(html: string) {
  const tbody =
    html.match(/order-table[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i)?.[1] ??
    html.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1];
  if (!tbody) return [] as { code: string; name: string; qty: number; unitPrice: number; lineTotal: number }[];

  const items: { code: string; name: string; qty: number; unitPrice: number; lineTotal: number }[] = [];
  for (const row of tbody.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    );
    if (tds.length < 5) continue;
    const desc = tds[1];
    const qtyRaw = tds[2];
    const qtyMatch = qtyRaw.match(/-?\d+(?:\.\d+)?/);
    const qty = qtyMatch ? Math.abs(parseFloat(qtyMatch[0])) : 0;
    if (qty <= 0) continue;
    const unitPrice = num(tds[4]);
    const lineTotal = num(tds[tds.length - 1]) || unitPrice * qty;
    const code =
      desc.match(/^([A-Z0-9][A-Z0-9\-/. ]{1,40}?)\s*-/)?.[1]?.trim() ||
      desc.match(/\b(PA[A-Z0-9\-/.]+|PTA[A-Z0-9\-/.]+|D-\d+[^\s]*)\b/i)?.[1]?.trim() ||
      desc.slice(0, 40);
    items.push({ code, name: desc, qty, unitPrice, lineTotal: Math.abs(lineTotal) });
  }
  return items;
}

function parsePurchaseSummaryLines(summary: string) {
  const items: { name: string; code: string; qty: number }[] = [];
  const text = summary.replace(/<br\s*\/?>/gi, "\n");
  for (const part of text.split(/\n|,/)) {
    const line = part.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const m = line.match(/^(.+?)\s+x\s+(\d+(?:\.\d+)?)/i);
    if (!m) continue;
    const name = m[1].trim();
    const qty = parseFloat(m[2]);
    if (qty <= 0) continue;
    const code =
      name.match(/\b(PA[A-Z0-9\-/. ]+|PTA[A-Z0-9\-/.]+|D-\d+[^\s]*)\b/i)?.[1]?.replace(/\s+/g, "") ||
      name.slice(0, 40);
    items.push({ name, code, qty });
  }
  return items;
}

async function main() {
  loadEnvFile();
  if (!process.argv.includes("--i-confirm-production")) {
    throw new Error("Pass --i-confirm-production to write to PRODUCTION_DATABASE_URL");
  }
  const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!url || url.includes("neon.tech")) {
    throw new Error("Set PRODUCTION_DATABASE_URL to VPS (tunnel), not Neon");
  }

  const identity = process.env.OLD_POS_IDENTITY?.trim();
  const password = process.env.OLD_POS_PASSWORD;
  if (!identity || !password) {
    throw new Error("Set OLD_POS_IDENTITY and OLD_POS_PASSWORD to fetch sale line details");
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const coa = new ChartOfAccountsService();
  const oldPos = new OldPosClient();
  await oldPos.login(identity, password);

  const admin = await prisma.user.findFirst({
    where: { OR: [{ email: "admin@admin.com" }, { role: "SUPER_ADMIN" }] },
    orderBy: { created_at: "asc" },
  });
  if (!admin) throw new Error("No admin user in DB");
  const createdBy = admin.id;

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

  const stats = {
    customers: 0,
    products: 0,
    expenses: 0,
    sales: 0,
    skippedSales: 0,
    purchases: 0,
    customerBalanceSync: 0,
  };

  try {
    // ----- Customers -----
    const customerNameToOld = new Map<string, string>();
    for (const row of readLiveJson("customers.json")) {
      const oldId = clean(row[0]);
      const name = clean(row[2]) || clean(row[1]);
      if (oldId && name) customerNameToOld.set(name.toLowerCase(), oldId);
    }

    for (const row of readLiveJson("customers.json")) {
      const oldId = clean(row[0]);
      if (!oldId) continue;
      const exists = await prisma.customer.findFirst({
        where: { notes: { contains: `legacy_customer_id=${oldId}` } },
      });
      if (exists) continue;
      const name = clean(row[2]) || clean(row[1]) || `Customer ${oldId}`;
      const opening = num(row[8]);
      if (DRY) {
        stats.customers++;
        continue;
      }
      await prisma.customer.create({
        data: {
          name,
          phone_number: clean(row[4]) || null,
          mobile_number: clean(row[4]) || null,
          email: clean(row[3]) || null,
          is_active: true,
          customer_tags: ["legacy-import", "live-delta"],
          notes: `legacy_customer_id=${oldId}`,
          previous_credit_balance: opening,
        },
      });
      stats.customers++;
    }

    // Sync opening/due from live export (col 8) for all legacy customers
    for (const row of readLiveJson("customers.json")) {
      const oldId = clean(row[0]);
      if (!oldId) continue;
      const opening = num(row[8]);
      const cust = await prisma.customer.findFirst({
        where: { notes: { contains: `legacy_customer_id=${oldId}` } },
        select: { id: true, previous_credit_balance: true },
      });
      if (!cust) continue;
      const cur = Number(cust.previous_credit_balance || 0);
      if (Math.abs(cur - opening) < 0.01) continue;
      if (DRY) {
        stats.customerBalanceSync++;
        continue;
      }
      await prisma.customer.update({
        where: { id: cust.id },
        data: { previous_credit_balance: opening },
      });
      stats.customerBalanceSync++;
    }

    // ----- Products (live list) -----
    const productByOldId = new Map<string, string>();
    const productByCode = new Map<string, string>();
    for (const p of await prisma.product.findMany({ select: { id: true, code: true, description: true } })) {
      productByCode.set(p.code.toLowerCase(), p.id);
      const m = (p.description || "").match(/legacy_product_id=(\d+)/);
      if (m) productByOldId.set(m[1], p.id);
    }

    async function ensureProduct(code: string, name: string, price: number, oldIdHint?: string) {
      const c = code.trim() || `LEGACY-${oldIdHint || "X"}`;
      const key = c.toLowerCase();
      if (productByCode.has(key)) return productByCode.get(key)!;
      if (oldIdHint && productByOldId.has(oldIdHint)) return productByOldId.get(oldIdHint)!;

      if (DRY) {
        stats.products++;
        return "dry-run-product-id";
      }

      let finalCode = c;
      if (await prisma.product.findUnique({ where: { code: finalCode } })) {
        finalCode = `${c}-${oldIdHint || Date.now()}`;
      }
      const created = await prisma.product.create({
        data: {
          code: finalCode,
          sku: finalCode,
          name: name.slice(0, 250) || finalCode,
          unit_id: unit.id,
          category_id: generalCat?.id,
          purchase_rate: price,
          sales_rate_exc_dis_and_tax: price,
          sales_rate_inc_dis_and_tax: price,
          is_active: true,
          display_on_pos: true,
          description: oldIdHint ? `legacy_product_id=${oldIdHint}` : "legacy_live_delta=1",
        },
      });
      await prisma.stock.upsert({
        where: { product_id_branch_id: { product_id: created.id, branch_id: branch!.id } },
        create: { product_id: created.id, branch_id: branch!.id, current_quantity: 0 },
        update: {},
      });
      productByCode.set(finalCode.toLowerCase(), created.id);
      if (oldIdHint) productByOldId.set(oldIdHint, created.id);
      stats.products++;
      return created.id;
    }

    for (const row of readLiveJson("products.json")) {
      const oldId = clean(row[0]);
      if (!oldId || productByOldId.has(oldId)) continue;
      const code = clean(row[2]);
      const name = clean(row[3]) || code;
      const price = num(row[6]);
      await ensureProduct(code, name, price, oldId);
    }

    // ----- Expenses -----
    const expenseCatCache = new Map<string, string>();
    async function expenseCategoryId(name: string) {
      const key = name || "Daily Expense";
      if (expenseCatCache.has(key)) return expenseCatCache.get(key)!;
      let cat = await prisma.expenseCategory.findUnique({ where: { name: key } });
      if (!cat) {
        if (DRY) return "dry-cat";
        cat = await prisma.expenseCategory.create({
          data: { name: key, description: "Imported from previous POS (live delta)", is_active: true },
        });
      }
      expenseCatCache.set(key, cat.id);
      return cat.id;
    }

    for (const row of readLiveJson("expenses.json")) {
      const oldId = clean(row[0]);
      const amount = num(row[4]);
      if (!oldId || amount <= 0) continue;
      const exists = await prisma.expense.findFirst({
        where: { notes: { contains: `legacy_expense_id=${oldId}` } },
      });
      if (exists) continue;
      const catName = clean(row[3]) || "Daily Expense";
      const particular = clean(row[2]) || catName;
      if (DRY) {
        stats.expenses++;
        continue;
      }
      await prisma.expense.create({
        data: {
          particular,
          amount,
          category_id: await expenseCategoryId(catName),
          expense_date: parseDate(String(row[1])),
          payment_method: ExpensePaymentMethod.CASH,
          notes: `legacy_expense_id=${oldId};live_delta=1`,
          status: ExpenseStatus.APPROVED,
          approved_by: createdBy,
          approved_at: parseDate(String(row[1])),
          branch_id: branch.id,
          created_by: createdBy,
        },
      });
      stats.expenses++;
    }

    // ----- Sales -----
    const saleRows = readLiveJson("sales-all.json");
    const existingLegacy = new Set<string>();
    const existingReturnLegacy = new Set<string>();
    for (const s of await prisma.sale.findMany({
      where: { OR: [{ notes: { contains: "legacy_sale_id=" } }, { notes: { contains: "legacy_return_id=" } }] },
      select: { notes: true },
    })) {
      const m = (s.notes || "").match(/legacy_sale_id=(\d+)/);
      if (m) existingLegacy.add(m[1]);
      const r = (s.notes || "").match(/legacy_return_id=(\d+)/);
      if (r) existingReturnLegacy.add(r[1]);
    }

    const returnToOriginal = new Map<string, string>();
    for (const row of saleRows) {
      const sid = clean(row[0]);
      const retId = clean(row[12]);
      if (sid && retId) returnToOriginal.set(retId, sid);
    }

    const saleIdMap = new Map<string, string>();
    for (const s of await prisma.sale.findMany({
      where: { notes: { contains: "legacy_sale_id=" } },
      select: { id: true, notes: true },
    })) {
      const m = (s.notes || "").match(/legacy_sale_id=(\d+)/);
      if (m) saleIdMap.set(m[1], s.id);
    }

    for (const row of saleRows) {
      const oldSaleId = clean(row[0]);
      if (!oldSaleId) continue;
      const statusRaw = clean(row[6]).toLowerCase();
      const isReturn = statusRaw === "returned";
      if (isReturn ? existingReturnLegacy.has(oldSaleId) : existingLegacy.has(oldSaleId)) continue;
      const ref = clean(row[2]) || `SALE-LEGACY-${oldSaleId}`;
      const saleDate = parseDate(String(row[1]));
      const customerName = clean(row[4]).toLowerCase();
      const customerOld = customerNameToOld.get(customerName);
      let customerId: string | null = null;
      if (customerOld) {
        customerId =
          (
            await prisma.customer.findFirst({
              where: { notes: { contains: `legacy_customer_id=${customerOld}` } },
              select: { id: true },
            })
          )?.id || null;
      }

      const grand = num(row[7]);
      const paid = num(row[8]);
      const totalAmount = isReturn ? -Math.abs(grand || paid) : Math.abs(grand || paid);
      let paymentReceived = isReturn ? 0 : Math.min(Math.abs(paid), Math.abs(totalAmount));
      let paymentStatus: PaymentStatus = PaymentStatus.PAID;
      const payLabel = clean(row[10]).toLowerCase();
      if (!isReturn) {
        if (payLabel === "due" || payLabel === "pending") {
          paymentStatus = PaymentStatus.PENDING;
          paymentReceived = 0;
        } else if (payLabel === "partial" || paymentReceived + 0.009 < Math.abs(totalAmount)) {
          paymentStatus = PaymentStatus.PARTIAL;
        }
      }

      const html = await oldPos.saleView(oldSaleId);
      let items = parseSaleItemsFromView(html);
      if (!items.length) {
        const summaryCode = clean(row[5]).split(",")[0]?.trim() || `LEG-${oldSaleId}`;
        items = [
          {
            code: summaryCode,
            name: clean(row[5]) || summaryCode,
            qty: 1,
            unitPrice: Math.abs(totalAmount),
            lineTotal: Math.abs(totalAmount),
          },
        ];
      }

      const itemsData: {
        product_id: string;
        quantity: number;
        unit_price: number;
        line_total: number;
      }[] = [];

      for (const it of items) {
        const pid = await ensureProduct(it.code, it.name, it.unitPrice, undefined);
        const sign = isReturn ? -1 : 1;
        itemsData.push({
          product_id: pid,
          quantity: it.qty,
          unit_price: it.unitPrice,
          line_total: sign * it.lineTotal,
        });
      }

      const subtotal = itemsData.reduce((s, i) => s + i.line_total, 0);
      const finalTotal = Math.abs(totalAmount) > 0 ? totalAmount : subtotal;

      const originalOld = returnToOriginal.get(oldSaleId);
      const originalSaleId = originalOld ? saleIdMap.get(originalOld) || null : null;

      if (DRY) {
        stats.sales++;
        continue;
      }

      try {
        const sale = await prisma.sale.create({
          data: {
            sale_number: isReturn ? `RET-LIVE-${oldSaleId}` : ref,
            invoice_number: isReturn ? `${ref}-R${oldSaleId}` : ref,
            branch_id: branch.id,
            customer_id: customerId,
            sale_date: saleDate,
            subtotal,
            discount_amount: 0,
            tax_amount: 0,
            total_amount: finalTotal,
            payment_method: PaymentMethod.CASH,
            payment_status: isReturn ? PaymentStatus.PAID : paymentStatus,
            payment_received: isReturn ? 0 : paymentReceived,
            change_amount: 0,
            status: isReturn ? SaleStatus.REFUNDED : SaleStatus.COMPLETED,
            original_sale_id: originalSaleId,
            created_by: createdBy,
            notes: isReturn
              ? `legacy_return_id=${oldSaleId};live_delta=1`
              : `legacy_sale_id=${oldSaleId};live_delta=1`,
            sale_items: {
              create: itemsData.map((i) => ({
                product_id: i.product_id,
                quantity: i.quantity,
                unit_price: Math.abs(i.unit_price),
                line_total: i.line_total,
                tax_rate: 0,
                tax_amount: 0,
                discount_rate: 0,
                discount_amount: 0,
                item_type: isReturn ? SaleItemType.RETURN : SaleItemType.ORIGINAL,
              })),
            },
            payments:
              !isReturn && paymentReceived > 0
                ? { create: [{ method: PaymentMethod.CASH, amount: paymentReceived }] }
                : undefined,
          },
        });
        saleIdMap.set(oldSaleId, sale.id);
        stats.sales++;
        process.stdout.write(`\rSales imported: ${stats.sales}   `);
      } catch (e: any) {
        if (e?.code === "P2002") {
          stats.skippedSales++;
          continue;
        }
        throw e;
      }
    }
    console.log("");

    // ----- Purchases (live headers missing in DB) -----
    const dbPurchIds = new Set<string>();
    for (const inv of await prisma.purchaseInvoice.findMany({
      where: { notes: { contains: "legacy_purchase_id=" } },
      select: { notes: true },
    })) {
      const m = (inv.notes || "").match(/legacy_purchase_id=(\d+)/);
      if (m) dbPurchIds.add(m[1]);
    }
    const supplierByName = new Map<string, string>();
    for (const s of await prisma.supplier.findMany({ select: { id: true, name: true } })) {
      supplierByName.set(s.name.toLowerCase(), s.id);
    }

    for (const row of readLiveJson("purchases.json")) {
      const oldPurchId = clean(row[0]);
      if (!oldPurchId || dbPurchIds.has(oldPurchId)) continue;
      const supplierName = clean(row[3]);
      const supplierId = supplierByName.get(supplierName.toLowerCase());
      if (!supplierId) {
        console.warn("Skip purchase — unknown supplier", oldPurchId, supplierName);
        continue;
      }
      const rawRef = clean(row[2]);
      const ref = rawRef && rawRef !== "0" ? rawRef : `PO-LEGACY-${oldPurchId}`;
      const purchaseDate = parseDate(String(row[1]));
      const payStatus = clean(row[10]).toLowerCase();
      const grand = Math.abs(num(row[7]) || num(row[9]));

      let lines = parsePurchaseSummaryLines(String(row[5] || ""));
      if (!lines.length) {
        const html = await oldPos.purchaseView(oldPurchId);
        lines = parseSaleItemsFromView(html).map((it) => ({
          name: it.name,
          code: it.code,
          qty: it.qty,
        }));
      }
      if (!lines.length) {
        console.warn("Skip purchase — no lines", oldPurchId);
        continue;
      }
      const totalQty = lines.reduce((s, l) => s + l.qty, 0);
      const unitCost = totalQty > 0 ? grand / totalQty : grand;

      if (DRY) {
        stats.purchases++;
        continue;
      }

      const billGroupId = randomUUID();
      const createdPurchaseIds: string[] = [];
      let billTotal = 0;
      for (const l of lines) {
        const pid = await ensureProduct(l.code, l.name, unitCost, undefined);
        const lineTotal = l.qty * unitCost;
        billTotal += lineTotal;
        const prod = await prisma.product.findUnique({
          where: { id: pid },
          select: { sales_rate_inc_dis_and_tax: true },
        });
        const salePrice = num(prod?.sales_rate_inc_dis_and_tax) || unitCost;
        const p = await prisma.purchase.create({
          data: {
            product_id: pid,
            supplier_id: supplierId,
            warehouse_branch_id: branch.id,
            quantity: l.qty,
            cost_price: unitCost,
            sale_price: salePrice,
            purchase_date: purchaseDate,
            invoice_ref: ref,
            bill_group_id: billGroupId,
            notes: `legacy_purchase_id=${oldPurchId};live_delta=1`,
            delivery_status: PurchaseDeliveryStatus.COMPLETE,
            created_by: createdBy,
          },
        });
        createdPurchaseIds.push(p.id);
      }
      if (!createdPurchaseIds.length) continue;

      const invoiceTotal = billTotal > 0 ? billTotal : grand;
      const amountPaid = payStatus === "paid" ? invoiceTotal : 0;
      const invStatus =
        amountPaid <= 0.009
          ? PurchaseInvoiceStatus.UNPAID
          : amountPaid + 0.009 >= invoiceTotal
            ? PurchaseInvoiceStatus.PAID
            : PurchaseInvoiceStatus.PARTIALLY_PAID;

      const invoice = await prisma.purchaseInvoice.create({
        data: {
          invoice_number: `${ref}#${oldPurchId}`,
          supplier_id: supplierId,
          branch_id: branch.id,
          invoice_date: purchaseDate,
          subtotal: invoiceTotal,
          total_amount: invoiceTotal,
          amount_paid: amountPaid,
          status: invStatus,
          notes: `legacy_purchase_id=${oldPurchId};source_ref=${ref};live_delta=1`,
          created_by: createdBy,
        },
      });
      await prisma.purchase.updateMany({
        where: { id: { in: createdPurchaseIds } },
        data: { purchase_invoice_id: invoice.id },
      });
      if (amountPaid > 0.009) {
        await prisma.supplierPayment.create({
          data: {
            supplier_id: supplierId,
            amount: amountPaid,
            type: "PAYMENT",
            payment_date: purchaseDate,
            method: "CASH",
            reference: ref,
            notes: `legacy paid purchase ${oldPurchId}`,
            purchase_invoice_id: invoice.id,
            created_by: createdBy,
          },
        });
      }
      dbPurchIds.add(oldPurchId);
      stats.purchases++;
      console.log("Imported purchase", oldPurchId, ref, invoiceTotal);
    }

    if (!DRY) {
      await coa.syncLinkedAccounts().catch(() => undefined);
    }

    console.log(DRY ? "DRY RUN complete:" : "Delta import complete:", stats);
    const totalSales = await prisma.sale.count();
    const legacySales = await prisma.sale.count({ where: { notes: { contains: "legacy_sale_id=" } } });
    console.log("DB sales total:", totalSales, "| rows with legacy_sale_id:", legacySales);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
