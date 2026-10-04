/**
 * 1) Rebuild missing original sales for legacy returns (export only had returned rows)
 * 2) Add cash REFUND payments so customer AR matches old ledger
 * 3) Restore purchase return 105 with a balancing purchase (DELETE case) so supplier due stays 0
 * 4) Re-align supplier invoices to ledger
 *
 *   npx ts-node scripts/fix-legacy-returns-and-balances.ts --i-confirm-production
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
  PurchaseInvoiceStatus,
  PurchaseDeliveryStatus,
  PurchaseReturnStatus,
} from "@prisma/client";

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

function readCsv(fileName: string) {
  const buf = fs.readFileSync(path.join(DATA, fileName));
  const preferLatin1 = /pUrchase/i.test(fileName);
  let text = preferLatin1 ? buf.toString("latin1") : buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true, trim: true, bom: true }) as Record<
    string,
    string
  >[];
}

function clean(v: unknown) {
  const s = String(v ?? "").trim();
  return !s || s.toUpperCase() === "NULL" ? "" : s;
}
function num(v: unknown) {
  const n = Number(String(v ?? "").replace(/,/g, "").replace(/"/g, "").trim() || 0);
  return Number.isFinite(n) ? n : 0;
}
function parseDate(raw: string) {
  const s = clean(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.replace(" ", "T"));
    if (!Number.isNaN(d.getTime())) return d;
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  return new Date(s);
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
    const branch = await prisma.branch.findFirst({ where: { code: "WH1" } });
    if (!branch) throw new Error("Branch WH1 missing");

    const customers = await prisma.customer.findMany({ where: { notes: { contains: "legacy_customer_id=" } } });
    const custMap = new Map<string, string>();
    for (const c of customers) {
      const m = (c.notes || "").match(/(?:^|;\s*)legacy_customer_id=(\d+)(?:;|$)/);
      if (m) custMap.set(m[1], c.id);
    }

    const products = await prisma.product.findMany({ select: { id: true, code: true, description: true, name: true } });
    const prodByLegacy = new Map<string, string>();
    const prodByCode = new Map<string, string>();
    const prodByName = new Map<string, string>();
    for (const p of products) {
      prodByCode.set(p.code.toLowerCase(), p.id);
      prodByName.set(p.name.toLowerCase(), p.id);
      const m = (p.description || "").match(/legacy_product_id=(\d+)/);
      if (m) prodByLegacy.set(m[1], p.id);
      const a = (p.description || "").match(/alias_product_id=(\d+)/);
      if (a) prodByLegacy.set(a[1], p.id);
    }

    function resolveProduct(oldId: string, code: string, name: string) {
      if (oldId && prodByLegacy.has(oldId)) return prodByLegacy.get(oldId)!;
      if (code && prodByCode.has(code.toLowerCase())) return prodByCode.get(code.toLowerCase())!;
      if (name && prodByName.has(name.toLowerCase())) return prodByName.get(name.toLowerCase())!;
      return null;
    }

    const salesReturns = readCsv("All Sales Return.csv");
    const retGroups = new Map<string, Record<string, string>[]>();
    for (const r of salesReturns) {
      const id = clean(r.return_id);
      if (!retGroups.has(id)) retGroups.set(id, []);
      retGroups.get(id)!.push(r);
    }

    const dbReturns = await prisma.sale.findMany({
      where: { notes: { contains: "legacy_return_id=" } },
      select: { id: true, notes: true, total_amount: true, customer_id: true, sale_date: true, original_sale_id: true },
    });
    const retByOld = new Map<string, (typeof dbReturns)[0]>();
    for (const r of dbReturns) {
      const m = (r.notes || "").match(/legacy_return_id=(\d+)/);
      if (m) retByOld.set(m[1], r);
    }

    await prisma.customerPayment.deleteMany({ where: { notes: { contains: "legacy_return_refund=" } } });

    let originalsCreated = 0;
    let refunds = 0;

    for (const [oldRetId, lines] of retGroups) {
      const dbRet = retByOld.get(oldRetId);
      if (!dbRet) continue;
      const head = lines[0];
      const ref = clean(head.return_reference) || `SALE-RET-ORIG-${oldRetId}`;
      const custId = custMap.get(clean(head.customer_id)) || dbRet.customer_id;
      const absTotal = Math.abs(Number(dbRet.total_amount));

      let originalId = dbRet.original_sale_id;
      if (!originalId) {
        // Create synthetic original (paid) so AR nets correctly with the return
        const saleNumber = `ORIG/${oldRetId}`;
        const invoiceNumber = `${ref}-ORIG`;
        const existing = await prisma.sale.findFirst({
          where: { OR: [{ sale_number: saleNumber }, { notes: { contains: `legacy_synthetic_original_for_return=${oldRetId}` } }] },
        });
        if (existing) {
          originalId = existing.id;
        } else {
          const items = [];
          for (const l of lines) {
            const pid = resolveProduct(clean(l.product_id), clean(l.product_code), clean(l.product_name));
            if (!pid) continue;
            const qty = Math.abs(num(l.return_quantity || l.quantity));
            const unit = num(l.net_unit_price || l.unit_price);
            const line = Math.abs(num(l.return_amount) || unit * qty);
            items.push({
              product_id: pid,
              quantity: qty,
              unit_price: unit,
              line_total: line,
              tax_rate: 0,
              tax_amount: 0,
              discount_rate: 0,
              discount_amount: 0,
              item_type: SaleItemType.ORIGINAL,
            });
          }
          if (!items.length) continue;
          const subtotal = items.reduce((s, i) => s + i.line_total, 0);
          const total = absTotal > 0 ? absTotal : subtotal;
          const created = await prisma.sale.create({
            data: {
              sale_number: saleNumber,
              invoice_number: invoiceNumber,
              branch_id: branch.id,
              customer_id: custId,
              sale_date: parseDate(head.return_date),
              subtotal,
              total_amount: total,
              discount_amount: 0,
              tax_amount: 0,
              payment_method: PaymentMethod.CASH,
              payment_status: PaymentStatus.PAID,
              payment_received: total,
              status: SaleStatus.COMPLETED,
              created_by: admin.id,
              notes: `legacy_synthetic_original_for_return=${oldRetId};source_ref=${ref}`,
              sale_items: { create: items },
              payments: { create: [{ method: PaymentMethod.CASH, amount: total }] },
            },
          });
          originalId = created.id;
          originalsCreated++;
        }
        await prisma.sale.update({
          where: { id: dbRet.id },
          data: { original_sale_id: originalId, payment_received: 0 },
        });
      } else {
        await prisma.sale.update({ where: { id: dbRet.id }, data: { payment_received: 0 } });
      }

      // Cash refund offsets return credit for paid cycle
      if (custId && absTotal > 0.009) {
        await prisma.customerPayment.create({
          data: {
            customer_id: custId,
            type: "REFUND",
            sale_id: dbRet.id,
            amount: absTotal,
            payment_date: dbRet.sale_date,
            method: "CASH",
            reference: `RET/${oldRetId}`,
            notes: `legacy_return_refund=${oldRetId}`,
            created_by: admin.id,
          },
        });
        refunds++;
      }
    }
    console.log("Synthetic originals created:", originalsCreated, "refunds:", refunds);

    // ---- Restore purchase return 105 + balancing purchase/invoice ----
    const s14 = await prisma.supplier.findFirst({ where: { code: "LSUP-14" } });
    const prRows = readCsv("All Puchase Return.csv");
    if (s14 && prRows.length) {
      const existingPr = await prisma.purchaseReturn.findFirst({
        where: { notes: { contains: "legacy_purchase_return_id=105" } },
      });
      if (!existingPr) {
        const head = prRows[0];
        const productId = resolveProduct(clean(head.product_id), clean(head.product_code), clean(head.product_name));
        if (productId) {
          const qty = Math.abs(num(head.return_quantity));
          const cost = num(head.net_unit_cost || head.unit_cost);
          const total = qty * cost;
          const purchaseDate = parseDate(head.return_date);
          // balancing purchase + unpaid then return → net 0
          const inv = await prisma.purchaseInvoice.create({
            data: {
              invoice_number: "PO-LEGACY-106#106",
              supplier_id: s14.id,
              branch_id: branch.id,
              invoice_date: purchaseDate,
              subtotal: total,
              total_amount: total,
              amount_paid: 0,
              status: PurchaseInvoiceStatus.UNPAID,
              notes: "legacy_purchase_id=106;restored_for_return=105",
              created_by: admin.id,
            },
          });
          const prod = await prisma.product.findUnique({ where: { id: productId } });
          await prisma.purchase.create({
            data: {
              product_id: productId,
              supplier_id: s14.id,
              warehouse_branch_id: branch.id,
              quantity: qty,
              cost_price: cost,
              sale_price: Number(prod?.sales_rate_inc_dis_and_tax || cost),
              purchase_date: purchaseDate,
              invoice_ref: "DELETE-RESTORED-106",
              notes: "legacy_purchase_id=106;restored_for_return=105",
              delivery_status: PurchaseDeliveryStatus.COMPLETE,
              purchase_invoice_id: inv.id,
              created_by: admin.id,
            },
          });
          await prisma.purchaseReturn.create({
            data: {
              return_number: "PR-LEGACY-105",
              supplier_id: s14.id,
              branch_id: branch.id,
              return_date: purchaseDate,
              status: PurchaseReturnStatus.COMPLETED,
              reason: clean(head.return_reference) || "DELETE",
              notes: "legacy_purchase_return_id=105;original_purchase_id=106",
              total_amount: total,
              created_by: admin.id,
              items: {
                create: [{ product_id: productId, quantity: qty, unit_cost: cost, total_cost: total }],
              },
            },
          });
          console.log("Restored purchase 106 + return 105 for supplier Imran");
        }
      } else {
        console.log("Purchase return 105 already present");
      }
    }

    // ---- Re-align supplier invoices to ledger (keep restored 106) ----
    const supplierLedger = readCsv("Supplier Ledger.csv");
    const ledgerPurchaseAmt = new Map<string, number>();
    for (const r of supplierLedger) {
      if (clean(r.reference_type) === "purchase") ledgerPurchaseAmt.set(clean(r.reference_id), num(r.credit));
    }
    const invoices = await prisma.purchaseInvoice.findMany({
      where: { notes: { contains: "legacy_purchase_id=" } },
      select: { id: true, notes: true, total_amount: true, amount_paid: true },
    });
    let aligned = 0;
    for (const inv of invoices) {
      const m = (inv.notes || "").match(/legacy_purchase_id=(\d+)/);
      if (!m || !ledgerPurchaseAmt.has(m[1])) continue;
      const target = ledgerPurchaseAmt.get(m[1])!;
      if (Math.abs(Number(inv.total_amount) - target) > 0.009) {
        const paid = Number(inv.amount_paid);
        await prisma.purchaseInvoice.update({
          where: { id: inv.id },
          data: {
            subtotal: target,
            total_amount: target,
            status:
              paid <= 0.009
                ? PurchaseInvoiceStatus.UNPAID
                : paid + 0.009 >= target
                  ? PurchaseInvoiceStatus.PAID
                  : PurchaseInvoiceStatus.PARTIALLY_PAID,
          },
        });
        aligned++;
      }
    }
    console.log("Invoices re-aligned:", aligned);

    // ---- Set customer previous_credit_balance to absorb tiny residual vs CSV final ----
    // Prefer fixing via payments; then nudge opening for remainder under Rs 5? Skip nudge for now.

    console.log("Done");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
