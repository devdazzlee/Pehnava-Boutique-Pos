/**
 * Import Previous Pos Data CSVs into PRODUCTION only.
 *
 * Usage (with SSH tunnel to VPS Postgres, e.g. local port 5433):
 *   PRODUCTION_DATABASE_URL="postgresql://pehnava:***@127.0.0.1:5433/pehnava" \
 *     npx ts-node scripts/import-previous-pos-data.ts --i-confirm-production
 *
 * Refuses Neon / DATABASE_URL. Idempotent: skips if LEGACY-IMPORT marker sale exists.
 */
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import {
  PrismaClient,
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
  SaleItemType,
  ExpenseStatus,
  ExpensePaymentMethod,
  PurchaseReturnStatus,
  PurchaseDeliveryStatus,
  PurchaseInvoiceStatus,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { parseBusinessDateTime } from "../src/utils/timezone";
import {
  loadLegacySaleDatesFromLiveExport,
  resolveLegacySaleDateRaw,
} from "./legacy-pos-sale-dates";

const DATA_DIR = path.resolve(__dirname, "../../Previous Pos Data");
const ADMIN_FALLBACK_EMAIL = "admin";

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

function assertProductionUrl(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes("neon.tech") || lower.includes("neon.")) {
    throw new Error("Refusing to run: URL looks like Neon (local). Use PRODUCTION_DATABASE_URL only.");
  }
  if (lower.includes("ep-damp-sun")) {
    throw new Error("Refusing to run against the known local Neon host.");
  }
  if (!/\/\/[^/]*pehnava/.test(lower) && !lower.includes("/pehnava")) {
    console.warn("Warning: database name may not be pehnava — continuing because URL was provided as PRODUCTION_DATABASE_URL.");
  }
}

function readCsv(fileName: string): Record<string, string>[] {
  const full = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(full)) throw new Error(`Missing CSV: ${full}`);
  const buf = fs.readFileSync(full);
  // Purchase export uses Windows-1252 (byte 0x96 etc.); others are UTF-8.
  const preferLatin1 =
    /pUrchase|purchase|puchase/i.test(fileName) && fileName.toLowerCase().includes("all");
  let text: string;
  if (preferLatin1) {
    text = buf.toString("latin1");
  } else {
    text = buf.toString("utf8");
    if (text.includes("\uFFFD")) text = buf.toString("latin1");
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "" || v === "NULL") return 0;
  const n = Number(String(v).replace(/,/g, "").replace(/"/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function clean(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (!s || s.toUpperCase() === "NULL") return "";
  return s;
}

function parseDate(raw: string): Date {
  return parseBusinessDateTime(clean(raw));
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

function customerDisplayName(r: Record<string, string>): string {
  const contact = clean(r.contact_person);
  const name = clean(r.name);
  const company = clean(r.company);
  if (contact && contact !== "0") return contact;
  if (name && name !== "0") return name;
  if (company && company !== "0") return company;
  return `Customer ${r.customer_id}`;
}

async function main() {
  loadEnvFile();

  if (!process.argv.includes("--i-confirm-production")) {
    throw new Error("Add --i-confirm-production to import into production.");
  }

  let url = process.env.PRODUCTION_DATABASE_URL || "";
  // Allow tunnel port override without editing .env
  const portOverride = process.env.PRODUCTION_DB_PORT;
  if (!url) {
    throw new Error("PRODUCTION_DATABASE_URL is not set in Backend/.env (uncomment it) or environment.");
  }
  // Strip comment-style if user left it commented in shell somehow
  url = url.trim();
  if (portOverride) {
    url = url.replace(/@:(\d+)/, () => `@:${portOverride}`).replace(/127\.0\.0\.1:\d+/, `127.0.0.1:${portOverride}`);
  }
  // Default: if URL points at 5432 and tunnel is on 5433, allow PRODUCTION_DB_PORT=5433
  assertProductionUrl(url);

  console.log("Connecting to PRODUCTION via:", url.replace(/:[^:@/]+@/, ":***@"));

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const already = await prisma.sale.findFirst({
      where: { notes: { contains: "LEGACY-IMPORT-MARKER" } },
      select: { id: true, sale_number: true },
    });
    if (already) {
      console.log("Import already present (marker sale found). Aborting to avoid duplicates:", already.sale_number);
      return;
    }

    const admin = await prisma.user.findFirst({
      where: { OR: [{ email: ADMIN_FALLBACK_EMAIL }, { role: "SUPER_ADMIN" }, { role: "ADMIN" }] },
      orderBy: { created_at: "asc" },
    });
    if (!admin) throw new Error("No admin user found in production DB.");
    const createdBy = admin.id;
    console.log("Using admin:", admin.email, admin.id);

    // ---------- CSV load ----------
    const productRows = readCsv("Product List.csv");
    const customerRows = readCsv("Customer.csv");
    const supplierRows = readCsv("Suppliers.csv");
    const salesRows = readCsv("All Sales.csv");
    const salesReturnRows = readCsv("All Sales Return.csv");
    const purchaseRows = readCsv("All pUrchase.csv");
    const purchaseReturnRows = readCsv("All Puchase Return.csv");
    const expenseRows = readCsv("Expense Sheet.csv");
    const customerLedgerRows = readCsv("Customer Ledger.csv");

    console.log("CSV counts:", {
      products: productRows.length,
      customers: customerRows.length,
      suppliers: supplierRows.length,
      saleLines: salesRows.length,
      saleReturnLines: salesReturnRows.length,
      purchaseLines: purchaseRows.length,
      purchaseReturnLines: purchaseReturnRows.length,
      expenses: expenseRows.length,
      customerLedger: customerLedgerRows.length,
    });

    // ---------- Branch / Unit ----------
    const branch = await prisma.branch.upsert({
      where: { code: "WH1" },
      create: {
        code: "WH1",
        name: "Warehouse 1",
        address: "Imported from previous POS",
        is_active: true,
      },
      update: { name: "Warehouse 1", is_active: true },
    });
    await prisma.user.update({ where: { id: createdBy }, data: { branch_id: branch.id } });

    const unit = await prisma.unit.upsert({
      where: { code: "PCS" },
      create: { code: "PCS", name: "Pcs", is_active: true, display_on_pos: true },
      update: { name: "Pcs", is_active: true },
    });

    // ---------- Categories / Brands from product list ----------
    const categoryIds = new Set<string>();
    const brandIds = new Set<string>();
    for (const r of productRows) {
      if (clean(r.category_id)) categoryIds.add(clean(r.category_id));
      if (clean(r.brand) && clean(r.brand) !== "0") brandIds.add(clean(r.brand));
    }

    const categoryMap = new Map<string, string>(); // oldId -> uuid
    for (const oldId of categoryIds) {
      const code = `LCAT-${oldId}`;
      const name = `Category ${oldId}`;
      const slug = `legacy-cat-${oldId}`;
      const cat = await prisma.category.upsert({
        where: { code },
        create: {
          code,
          name,
          slug,
          display_on_branches: [branch.id],
          branch_id: branch.id,
          is_active: true,
          display_on_pos: true,
        },
        update: { is_active: true, display_on_pos: true },
      });
      categoryMap.set(oldId, cat.id);
    }

    const generalCat = await prisma.category.upsert({
      where: { code: "LCAT-GENERAL" },
      create: {
        code: "LCAT-GENERAL",
        name: "Imported / General",
        slug: "imported-general",
        display_on_branches: [branch.id],
        branch_id: branch.id,
        is_active: true,
        display_on_pos: true,
      },
      update: { is_active: true },
    });

    const brandMap = new Map<string, string>();
    for (const oldId of brandIds) {
      const code = `LBR-${oldId}`;
      const brand = await prisma.brand.upsert({
        where: { code },
        create: { code, name: `Brand ${oldId}`, is_active: true, display_on_pos: true },
        update: { is_active: true },
      });
      brandMap.set(oldId, brand.id);
    }

    // ---------- Suppliers ----------
    const supplierMap = new Map<string, string>(); // oldId -> uuid
    for (const r of supplierRows) {
      const oldId = clean(r.supplier_id);
      if (!oldId) continue;
      const code = `LSUP-${oldId}`;
      const name = clean(r.company) || clean(r.name) || `Supplier ${oldId}`;
      const phone = clean(r.phone) || null;
      const email = clean(r.email) || null;
      const address = [clean(r.address), clean(r.city), clean(r.country)].filter(Boolean).join(", ") || null;
      const sup = await prisma.supplier.upsert({
        where: { code },
        create: {
          code,
          name,
          phone_number: phone,
          mobile_number: phone,
          email,
          address,
          city: clean(r.city) || null,
          country: clean(r.country) || null,
          contact_person: clean(r.contact_person) || null,
          ntn: clean(r.nic_ntn) || null,
          is_active: true,
          display_on_pos: true,
          notes: `Legacy supplier_id=${oldId}`,
        },
        update: {
          name,
          phone_number: phone,
          email,
          address,
          is_active: true,
        },
      });
      supplierMap.set(oldId, sup.id);
    }

    // Ensure suppliers referenced in purchases exist
    for (const r of purchaseRows) {
      const oldId = clean(r.supplier_id);
      if (!oldId || supplierMap.has(oldId)) continue;
      const code = `LSUP-${oldId}`;
      const name = clean(r.supplier_name) || `Supplier ${oldId}`;
      const sup = await prisma.supplier.upsert({
        where: { code },
        create: { code, name, is_active: true, display_on_pos: true, notes: `Legacy supplier_id=${oldId}` },
        update: { name, is_active: true },
      });
      supplierMap.set(oldId, sup.id);
    }

    // ---------- Customers ----------
    const customerMap = new Map<string, string>();
    for (const r of customerRows) {
      const oldId = clean(r.customer_id);
      if (!oldId) continue;
      const name = customerDisplayName(r);
      const phone = clean(r.phone) || null;
      const email = clean(r.email) || null;
      // Exact marker only — `contains` would match id=20 against id=204
      const existing = await prisma.customer.findFirst({
        where: { notes: `legacy_customer_id=${oldId}` },
      });
      if (existing) {
        customerMap.set(oldId, existing.id);
        continue;
      }
      const created = await prisma.customer.create({
        data: {
          name,
          phone_number: phone,
          mobile_number: phone,
          email,
          address: clean(r.address) || null,
          ntn: clean(r.nic_ntn) || null,
          is_active: true,
          customer_tags: ["legacy-import", clean(r.customer_group_name) || "General"].filter(Boolean),
          notes: `legacy_customer_id=${oldId}`,
          previous_credit_balance: 0,
        },
      });
      customerMap.set(oldId, created.id);
    }
    console.log("Customers imported:", customerMap.size);

    // ---------- Products ----------
    const productMap = new Map<string, string>(); // old product_id -> uuid
    const productByCode = new Map<string, string>();
    const productByName = new Map<string, string>();

    let productCreated = 0;
    for (const r of productRows) {
      const oldId = clean(r.product_id);
      const code = clean(r.product_code) || `LEGACY-${oldId}`;
      const sku = code;
      const name = clean(r.product_name) || code;
      const cost = num(r.cost);
      const price = num(r.price);
      const stockQty = num(r.current_stock);
      const catId = categoryMap.get(clean(r.category_id)) || generalCat.id;
      const brandId = brandMap.get(clean(r.brand)) || null;
      const supplierId = supplierMap.get(clean(r.supplier_1_id)) || null;

      const existing = await prisma.product.findUnique({ where: { code } });
      let productId: string;
      if (existing) {
        productId = existing.id;
        await prisma.product.update({
          where: { id: productId },
          data: {
            name,
            purchase_rate: cost,
            sales_rate_exc_dis_and_tax: price,
            sales_rate_inc_dis_and_tax: price,
            category_id: catId,
            brand_id: brandId,
            supplier_id: supplierId,
            min_qty: Math.round(num(r.alert_quantity)),
            is_active: true,
            display_on_pos: true,
            description: `legacy_product_id=${oldId}`,
          },
        });
      } else {
        // sku must be unique — if collision, suffix
        let finalSku = sku;
        let finalCode = code;
        const skuClash = await prisma.product.findUnique({ where: { sku: finalSku } });
        if (skuClash) {
          finalSku = `${sku}-${oldId}`;
          finalCode = `${code}-${oldId}`;
        }
        const created = await prisma.product.create({
          data: {
            code: finalCode,
            sku: finalSku,
            name,
            unit_id: unit.id,
            purchase_rate: cost,
            sales_rate_exc_dis_and_tax: price,
            sales_rate_inc_dis_and_tax: price,
            category_id: catId,
            brand_id: brandId,
            supplier_id: supplierId,
            min_qty: Math.round(num(r.alert_quantity)),
            is_active: true,
            display_on_pos: true,
            display_on_website: true,
            description: `legacy_product_id=${oldId}`,
          },
        });
        productId = created.id;
        productCreated++;
      }

      productMap.set(oldId, productId);
      productByCode.set(code.toLowerCase(), productId);
      productByName.set(name.toLowerCase(), productId);

      await prisma.stock.upsert({
        where: { product_id_branch_id: { product_id: productId, branch_id: branch.id } },
        create: {
          product_id: productId,
          branch_id: branch.id,
          current_quantity: stockQty,
          minimum_quantity: num(r.alert_quantity),
        },
        update: { current_quantity: stockQty, minimum_quantity: num(r.alert_quantity) },
      });
    }
    console.log("Products from list:", productMap.size, "created:", productCreated);

    async function ensureProduct(opts: {
      oldId?: string;
      code?: string;
      name?: string;
      price?: number;
      cost?: number;
    }): Promise<string | null> {
      const oldId = clean(opts.oldId);
      if (oldId && productMap.has(oldId)) return productMap.get(oldId)!;
      const code = clean(opts.code);
      if (code && productByCode.has(code.toLowerCase())) {
        const id = productByCode.get(code.toLowerCase())!;
        if (oldId) productMap.set(oldId, id);
        return id;
      }
      const name = clean(opts.name);
      if (name && productByName.has(name.toLowerCase())) {
        const id = productByName.get(name.toLowerCase())!;
        if (oldId) productMap.set(oldId, id);
        return id;
      }
      if (!oldId && !code && !name) return null;

      const finalCode = code || `LEGACY-PID-${oldId || randomUUID().slice(0, 8)}`;
      const finalSku = finalCode;
      const finalName = name || finalCode;
      const price = opts.price || 0;
      const cost = opts.cost || price;

      const existing = await prisma.product.findUnique({ where: { code: finalCode } });
      if (existing) {
        if (oldId) productMap.set(oldId, existing.id);
        productByCode.set(finalCode.toLowerCase(), existing.id);
        productByName.set(finalName.toLowerCase(), existing.id);
        return existing.id;
      }

      const created = await prisma.product.create({
        data: {
          code: finalCode,
          sku: finalSku,
          name: finalName,
          unit_id: unit.id,
          purchase_rate: cost,
          sales_rate_exc_dis_and_tax: price,
          sales_rate_inc_dis_and_tax: price,
          category_id: generalCat.id,
          is_active: true,
          display_on_pos: true,
          description: oldId ? `legacy_product_id=${oldId};stub=1` : "legacy_stub=1",
        },
      });
      await prisma.stock.upsert({
        where: { product_id_branch_id: { product_id: created.id, branch_id: branch.id } },
        create: { product_id: created.id, branch_id: branch.id, current_quantity: 0 },
        update: {},
      });
      if (oldId) productMap.set(oldId, created.id);
      productByCode.set(finalCode.toLowerCase(), created.id);
      productByName.set(finalName.toLowerCase(), created.id);
      return created.id;
    }

    // Stub products referenced in sales / purchases / returns but missing from product list
    for (const r of [...salesRows, ...salesReturnRows, ...purchaseRows, ...purchaseReturnRows]) {
      const oldId = clean(r.product_id);
      const code = clean(r.product_code);
      const name = clean(r.product_name);
      if (!oldId && !code && !name) continue;
      if (oldId && productMap.has(oldId)) continue;
      await ensureProduct({
        oldId: oldId || undefined,
        code: code || undefined,
        name: name || undefined,
        price: num(r.unit_price || r.net_unit_price || r.unit_cost || r.net_unit_cost),
        cost: num(r.unit_cost || r.net_unit_cost || r.unit_price),
      });
    }
    console.log("Product map size after stubs:", productMap.size);

    // ---------- Customer payment totals by sale reference ----------
    const paidBySaleRef = new Map<string, number>();
    for (const r of customerLedgerRows) {
      if (clean(r.reference_type) !== "sale_payment") continue;
      const narration = clean(r.narration);
      const m = narration.match(/(SALE\/POS\/\d{4}\/\d{2}\/\d+)/i);
      if (!m) continue;
      const ref = m[1].toUpperCase();
      paidBySaleRef.set(ref, (paidBySaleRef.get(ref) || 0) + num(r.credit));
    }

    // ---------- Sales ----------
    type SaleLine = Record<string, string>;
    const salesById = new Map<string, SaleLine[]>();
    for (const r of salesRows) {
      const qty = num(r.quantity);
      // Return lines live in All Sales Return.csv; skip negatives / returned docs here
      if (qty <= 0) continue;
      if (clean(r.sale_status).toLowerCase() === "returned") continue;
      const sid = clean(r.sale_id);
      if (!sid) continue;
      if (!salesById.has(sid)) salesById.set(sid, []);
      salesById.get(sid)!.push(r);
    }

    const liveSaleDates = loadLegacySaleDatesFromLiveExport();
    const saleIdMap = new Map<string, string>(); // old sale_id -> new uuid
    let salesCreated = 0;

    for (const [oldSaleId, lines] of salesById) {
      const head = lines[0];
      const ref = clean(head.reference_no) || `SALE-LEGACY-${oldSaleId}`;
      const saleDateRaw = resolveLegacySaleDateRaw({
        index: liveSaleDates,
        oldSaleId,
        referenceNo: ref,
        csvFallback: head.sale_date,
      });
      const saleDate = parseDate(saleDateRaw);
      const customerOld = clean(head.customer_id);
      const customerId = customerMap.get(customerOld) || null;
      const grand = Math.abs(num(head.grand_total));
      const lineSum = lines.reduce((s, l) => s + num(l.sale_amount), 0);
      const totalAmount = grand > 0 ? grand : lineSum;

      const payStatusRaw = clean(head.payment_status).toLowerCase();
      let paymentStatus: PaymentStatus = PaymentStatus.PAID;
      let paymentReceived = totalAmount;
      if (payStatusRaw === "due" || payStatusRaw === "pending") {
        paymentStatus = PaymentStatus.PENDING;
        paymentReceived = 0;
      } else if (payStatusRaw === "partial") {
        paymentStatus = PaymentStatus.PARTIAL;
        const fromLedger = paidBySaleRef.get(ref.toUpperCase());
        paymentReceived =
          fromLedger !== undefined ? Math.min(fromLedger, totalAmount) : Math.round(totalAmount * 0.5 * 100) / 100;
      } else {
        const fromLedger = paidBySaleRef.get(ref.toUpperCase());
        if (fromLedger !== undefined) {
          paymentReceived = Math.min(fromLedger, totalAmount);
          if (paymentReceived + 0.009 < totalAmount) paymentStatus = PaymentStatus.PARTIAL;
          if (paymentReceived <= 0.009) paymentStatus = PaymentStatus.PENDING;
        }
      }

      const itemsData: {
        product_id: string;
        quantity: number;
        unit_price: number;
        line_total: number;
        item_type: SaleItemType;
      }[] = [];

      for (const l of lines) {
        const pid = await ensureProduct({
          oldId: clean(l.product_id),
          code: clean(l.product_code),
          name: clean(l.product_name),
          price: num(l.net_unit_price || l.unit_price),
        });
        if (!pid) continue;
        const qty = num(l.quantity);
        const unitPrice = num(l.net_unit_price || l.unit_price);
        const lineTotal = num(l.sale_amount) || unitPrice * qty;
        itemsData.push({
          product_id: pid,
          quantity: qty,
          unit_price: unitPrice,
          line_total: lineTotal,
          item_type: SaleItemType.ORIGINAL,
        });
      }
      if (!itemsData.length) continue;

      const subtotal = itemsData.reduce((s, i) => s + i.line_total, 0);
      // If grand_total differs from line sum, treat difference as discount
      let discount = 0;
      let finalTotal = totalAmount;
      if (grand > 0 && subtotal > grand + 0.05) {
        discount = Math.round((subtotal - grand) * 100) / 100;
        finalTotal = grand;
      } else {
        finalTotal = subtotal;
        // keep paymentReceived capped
        if (paymentReceived > finalTotal) paymentReceived = finalTotal;
      }

      try {
        const sale = await prisma.sale.create({
          data: {
            sale_number: ref,
            invoice_number: ref,
            branch_id: branch.id,
            customer_id: customerId,
            sale_date: saleDate,
            subtotal,
            discount_amount: discount,
            tax_amount: 0,
            total_amount: finalTotal,
            payment_method: PaymentMethod.CASH,
            payment_status: paymentStatus,
            payment_received: paymentReceived,
            change_amount: 0,
            status: SaleStatus.COMPLETED,
            created_by: createdBy,
            notes: `legacy_sale_id=${oldSaleId}`,
            sale_items: {
              create: itemsData.map((i) => ({
                product_id: i.product_id,
                quantity: i.quantity,
                unit_price: i.unit_price,
                line_total: i.line_total,
                tax_rate: 0,
                tax_amount: 0,
                discount_rate: 0,
                discount_amount: 0,
                item_type: i.item_type,
              })),
            },
            payments:
              paymentReceived > 0
                ? {
                    create: [
                      {
                        method: PaymentMethod.CASH,
                        amount: paymentReceived,
                      },
                    ],
                  }
                : undefined,
          },
        });
        saleIdMap.set(oldSaleId, sale.id);
        salesCreated++;
      } catch (e: any) {
        if (e?.code === "P2002") {
          const existing = await prisma.sale.findFirst({
            where: { OR: [{ sale_number: ref }, { invoice_number: ref }] },
          });
          if (existing) saleIdMap.set(oldSaleId, existing.id);
          continue;
        }
        throw e;
      }
    }
    console.log("Sales created:", salesCreated);

    // ---------- Sale returns ----------
    const returnsById = new Map<string, SaleLine[]>();
    for (const r of salesReturnRows) {
      const rid = clean(r.return_id);
      if (!rid) continue;
      if (!returnsById.has(rid)) returnsById.set(rid, []);
      returnsById.get(rid)!.push(r);
    }

    let returnsCreated = 0;
    for (const [oldReturnId, lines] of returnsById) {
      const head = lines[0];
      const saleNumber = `RET/${oldReturnId}`;
      const invoiceNumber = clean(head.return_reference)
        ? `${clean(head.return_reference)}-R${oldReturnId}`
        : saleNumber;
      const originalOld = clean(head.original_sale_id);
      const originalSaleId = saleIdMap.get(originalOld) || null;
      const customerId = customerMap.get(clean(head.customer_id)) || null;
      const saleDate = parseDate(head.return_date);

      const itemsData: {
        product_id: string;
        quantity: number;
        unit_price: number;
        line_total: number;
      }[] = [];

      for (const l of lines) {
        const pid = await ensureProduct({
          oldId: clean(l.product_id),
          code: clean(l.product_code),
          name: clean(l.product_name),
          price: num(l.net_unit_price || l.unit_price),
        });
        if (!pid) continue;
        const qty = Math.abs(num(l.return_quantity || l.quantity));
        const unitPrice = num(l.net_unit_price || l.unit_price);
        const lineAbs = Math.abs(num(l.return_amount) || unitPrice * qty);
        itemsData.push({
          product_id: pid,
          quantity: -qty,
          unit_price: unitPrice,
          line_total: -lineAbs,
        });
      }
      if (!itemsData.length) continue;

      const total = itemsData.reduce((s, i) => s + i.line_total, 0); // negative
      const payStatusRaw = clean(head.payment_status).toLowerCase();
      const refunded = payStatusRaw === "paid" || payStatusRaw === "";

      try {
        await prisma.sale.create({
          data: {
            sale_number: saleNumber,
            invoice_number: invoiceNumber,
            branch_id: branch.id,
            customer_id: customerId,
            sale_date: saleDate,
            subtotal: total,
            discount_amount: 0,
            tax_amount: 0,
            total_amount: total,
            payment_method: PaymentMethod.CASH,
            payment_status: refunded ? PaymentStatus.PAID : PaymentStatus.PENDING,
            payment_received: refunded ? total : 0, // negative when refunded via cash
            status: SaleStatus.REFUNDED,
            original_sale_id: originalSaleId,
            created_by: createdBy,
            notes: `legacy_return_id=${oldReturnId};original_sale_id=${originalOld}`,
            sale_items: {
              create: itemsData.map((i) => ({
                product_id: i.product_id,
                quantity: i.quantity,
                unit_price: i.unit_price,
                line_total: i.line_total,
                tax_rate: 0,
                tax_amount: 0,
                discount_rate: 0,
                discount_amount: 0,
                item_type: SaleItemType.RETURN,
              })),
            },
          },
        });
        returnsCreated++;
      } catch (e: any) {
        if (e?.code === "P2002") continue;
        throw e;
      }
    }
    console.log("Sale returns created:", returnsCreated);

    // ---------- Purchases ----------
    type PurchLine = Record<string, string>;
    const purchById = new Map<string, PurchLine[]>();
    for (const r of purchaseRows) {
      if (clean(r.status).toLowerCase() === "returned") continue;
      if (num(r.quantity) <= 0) continue;
      const pid = clean(r.purchase_id);
      if (!pid) continue;
      if (!purchById.has(pid)) purchById.set(pid, []);
      purchById.get(pid)!.push(r);
    }

    let purchaseLinesCreated = 0;
    let invoicesCreated = 0;
    for (const [oldPurchId, lines] of purchById) {
      const head = lines[0];
      const supplierId = supplierMap.get(clean(head.supplier_id));
      if (!supplierId) {
        console.warn("Skip purchase — missing supplier", oldPurchId, head.supplier_id);
        continue;
      }
      const rawRef = clean(head.reference_no);
      const ref = rawRef && rawRef !== "0" ? rawRef : `PO-LEGACY-${oldPurchId}`;
      const invoiceNumber = `${ref}#${oldPurchId}`;
      const purchaseDate = parseDate(head.purchase_date);
      const billGroupId = randomUUID();
      const payStatus = clean(head.payment_status).toLowerCase();
      const grand = Math.abs(num(head.grand_total));

      const createdPurchaseIds: string[] = [];
      let billTotal = 0;

      for (const l of lines) {
        const productId = await ensureProduct({
          oldId: clean(l.product_id),
          code: clean(l.product_code),
          name: clean(l.product_name),
          cost: num(l.net_unit_cost || l.unit_cost),
          price: num(l.net_unit_cost || l.unit_cost),
        });
        if (!productId) {
          console.warn("Skip purchase line — no product", oldPurchId, l.product_name);
          continue;
        }
        const qty = num(l.quantity);
        const cost = num(l.net_unit_cost || l.unit_cost);
        billTotal += qty * cost;
        // sale_price from product if known
        const prod = await prisma.product.findUnique({ where: { id: productId }, select: { sales_rate_inc_dis_and_tax: true } });
        const salePrice = num(prod?.sales_rate_inc_dis_and_tax) || cost;

        const p = await prisma.purchase.create({
          data: {
            product_id: productId,
            supplier_id: supplierId,
            warehouse_branch_id: branch.id,
            quantity: qty,
            cost_price: cost,
            sale_price: salePrice,
            purchase_date: purchaseDate,
            invoice_ref: ref,
            bill_group_id: billGroupId,
            notes: `legacy_purchase_id=${oldPurchId}`,
            delivery_status: PurchaseDeliveryStatus.COMPLETE,
            created_by: createdBy,
          },
        });
        createdPurchaseIds.push(p.id);
        purchaseLinesCreated++;
      }

      if (!createdPurchaseIds.length) continue;

      // Prefer line sum as invoice total; grand_total on export is often the
      // whole PO total repeated on every line (can be huge / misleading).
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
          invoice_number: invoiceNumber,
          supplier_id: supplierId,
          branch_id: branch.id,
          invoice_date: purchaseDate,
          subtotal: invoiceTotal,
          total_amount: invoiceTotal,
          amount_paid: amountPaid,
          status: invStatus,
          notes: `legacy_purchase_id=${oldPurchId};source_ref=${ref}`,
          created_by: createdBy,
        },
      });
      invoicesCreated++;

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
    }
    console.log("Purchase lines:", purchaseLinesCreated, "invoices:", invoicesCreated);

    // ---------- Purchase returns ----------
    let purchaseReturnsCreated = 0;
    const prById = new Map<string, SaleLine[]>();
    for (const r of purchaseReturnRows) {
      const rid = clean(r.return_id);
      if (!rid) continue;
      if (!prById.has(rid)) prById.set(rid, []);
      prById.get(rid)!.push(r);
    }
    for (const [oldReturnId, lines] of prById) {
      const head = lines[0];
      const supplierId = supplierMap.get(clean(head.supplier_id));
      if (!supplierId) continue;
      const returnNumber = `PR-LEGACY-${oldReturnId}`;
      const returnDate = parseDate(head.return_date);

      const items: { product_id: string; quantity: number; unit_cost: number; total_cost: number }[] = [];
      for (const l of lines) {
        const productId = await ensureProduct({
          oldId: clean(l.product_id),
          code: clean(l.product_code),
          name: clean(l.product_name),
          cost: num(l.net_unit_cost || l.unit_cost),
        });
        if (!productId) continue;
        const qty = Math.abs(num(l.return_quantity || l.quantity));
        const unitCost = num(l.net_unit_cost || l.unit_cost);
        items.push({ product_id: productId, quantity: qty, unit_cost: unitCost, total_cost: qty * unitCost });
      }
      if (!items.length) continue;
      const total = items.reduce((s, i) => s + i.total_cost, 0);

      try {
        await prisma.purchaseReturn.create({
          data: {
            return_number: returnNumber,
            supplier_id: supplierId,
            branch_id: branch.id,
            return_date: returnDate,
            status: PurchaseReturnStatus.COMPLETED,
            reason: clean(head.return_reference) || "Legacy purchase return",
            notes: `legacy_purchase_return_id=${oldReturnId};original_purchase_id=${clean(head.original_purchase_id)}`,
            total_amount: total,
            created_by: createdBy,
            items: {
              create: items.map((i) => ({
                product_id: i.product_id,
                quantity: i.quantity,
                unit_cost: i.unit_cost,
                total_cost: i.total_cost,
              })),
            },
          },
        });
        purchaseReturnsCreated++;
      } catch (e: any) {
        if (e?.code === "P2002") continue;
        throw e;
      }
    }
    console.log("Purchase returns:", purchaseReturnsCreated);

    // ---------- Expenses ----------
    const expenseCatCache = new Map<string, string>();
    async function expenseCategoryId(name: string): Promise<string> {
      const key = name || "Daily Expense";
      if (expenseCatCache.has(key)) return expenseCatCache.get(key)!;
      const existing = await prisma.expenseCategory.findUnique({ where: { name: key } });
      if (existing) {
        expenseCatCache.set(key, existing.id);
        return existing.id;
      }
      const created = await prisma.expenseCategory.create({
        data: { name: key, description: "Imported from previous POS", is_active: true },
      });
      expenseCatCache.set(key, created.id);
      return created.id;
    }

    let expensesCreated = 0;
    for (const r of expenseRows) {
      const amount = num(r.amount);
      if (amount <= 0) continue;
      const particular = clean(r.reference) || clean(r.note) || clean(r.expense_category) || "Expense";
      const catName = clean(r.expense_category) || "Daily Expense";
      const category_id = await expenseCategoryId(catName);
      const expense_date = parseDate(r.expense_date);
      await prisma.expense.create({
        data: {
          particular,
          amount,
          category_id,
          expense_date,
          payment_method: ExpensePaymentMethod.CASH,
          reference: clean(r.reference) || null,
          notes: `legacy_expense_id=${clean(r.expense_id)};created_by_name=${clean(r.created_by)}`,
          status: ExpenseStatus.APPROVED,
          approved_by: createdBy,
          approved_at: expense_date,
          branch_id: branch.id,
          created_by: createdBy,
        },
      });
      expensesCreated++;
    }
    console.log("Expenses created:", expensesCreated);

    // ---------- Marker sale (idempotency) ----------
    await prisma.sale.create({
      data: {
        sale_number: `LEGACY-IMPORT-MARKER-${new Date().toISOString().slice(0, 10)}`,
        invoice_number: `LEGACY-IMPORT-MARKER-${Date.now()}`,
        branch_id: branch.id,
        sale_date: new Date(),
        subtotal: 0,
        total_amount: 0,
        payment_method: PaymentMethod.CASH,
        payment_status: PaymentStatus.PAID,
        payment_received: 0,
        status: SaleStatus.COMPLETED,
        created_by: createdBy,
        notes: "LEGACY-IMPORT-MARKER — previous POS CSV import complete",
      },
    });

    // ---------- Final counts ----------
    const summary = {
      products: await prisma.product.count(),
      stockRows: await prisma.stock.count(),
      customers: await prisma.customer.count(),
      suppliers: await prisma.supplier.count(),
      sales: await prisma.sale.count({ where: { status: SaleStatus.COMPLETED } }),
      refundedSales: await prisma.sale.count({ where: { status: SaleStatus.REFUNDED } }),
      saleItems: await prisma.saleItem.count(),
      purchases: await prisma.purchase.count(),
      purchaseInvoices: await prisma.purchaseInvoice.count(),
      purchaseReturns: await prisma.purchaseReturn.count(),
      expenses: await prisma.expense.count(),
      categories: await prisma.category.count(),
      brands: await prisma.brand.count(),
    };
    console.log("\n✅ Production import complete:", summary);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("\n❌ Import failed:", err);
  process.exit(1);
});
