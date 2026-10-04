/**
 * Align imported supplier invoices + customer sale payments with Previous POS ledgers.
 * Also removes orphan purchase return (DELETE / no original purchase in export).
 *
 *   npx ts-node scripts/fix-legacy-balances.ts --i-confirm-production
 */
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { PrismaClient, PaymentStatus, PurchaseInvoiceStatus } from "@prisma/client";

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function readCsv(fileName: string): Record<string, string>[] {
  const full = path.join(DATA, fileName);
  const buf = fs.readFileSync(full);
  const preferLatin1 = /pUrchase/i.test(fileName);
  let text = preferLatin1 ? buf.toString("latin1") : buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];
}

function clean(v: unknown): string {
  const s = String(v ?? "").trim();
  return !s || s.toUpperCase() === "NULL" ? "" : s;
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "" || v === "NULL") return 0;
  const n = Number(String(v).replace(/,/g, "").replace(/"/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  loadEnv();
  if (!process.argv.includes("--i-confirm-production")) throw new Error("Need --i-confirm-production");
  const url = process.env.PRODUCTION_DATABASE_URL || "";
  if (!url || url.includes("neon.tech")) throw new Error("PRODUCTION_DATABASE_URL required");

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const supplierLedger = readCsv("Supplier Ledger.csv");
    const customerLedger = readCsv("Customer Ledger.csv");
    const sales = readCsv("All Sales.csv");
    const salesReturns = readCsv("All Sales Return.csv");

    // ---- 1) Remove orphan purchase return (DELETE, no purchase rows for supplier) ----
    const orphan = await prisma.purchaseReturn.findMany({
      where: { OR: [{ return_number: "PR-LEGACY-105" }, { notes: { contains: "legacy_purchase_return_id=105" } }] },
    });
    for (const r of orphan) {
      await prisma.purchaseReturnItem.deleteMany({ where: { purchase_return_id: r.id } });
      await prisma.purchaseReturn.delete({ where: { id: r.id } });
      console.log("Removed orphan purchase return", r.return_number);
    }

    // ---- 2) Align purchase invoice totals to supplier ledger credits ----
    const ledgerPurchaseAmt = new Map<string, number>(); // purchase_id -> credit
    for (const r of supplierLedger) {
      if (clean(r.reference_type) !== "purchase") continue;
      ledgerPurchaseAmt.set(clean(r.reference_id), num(r.credit));
    }

    const invoices = await prisma.purchaseInvoice.findMany({
      where: { notes: { contains: "legacy_purchase_id=" } },
      select: { id: true, notes: true, total_amount: true, amount_paid: true, status: true, supplier_id: true },
    });

    let invUpdated = 0;
    for (const inv of invoices) {
      const m = (inv.notes || "").match(/legacy_purchase_id=(\d+)/);
      if (!m) continue;
      const oldId = m[1];
      if (!ledgerPurchaseAmt.has(oldId)) continue; // keep CSV amount if not in ledger (0-amount paid stubs etc.)
      const target = ledgerPurchaseAmt.get(oldId)!;
      const paid = Number(inv.amount_paid);
      const status =
        paid <= 0.009
          ? PurchaseInvoiceStatus.UNPAID
          : paid + 0.009 >= target
            ? PurchaseInvoiceStatus.PAID
            : PurchaseInvoiceStatus.PARTIALLY_PAID;
      if (Math.abs(Number(inv.total_amount) - target) > 0.009 || inv.status !== status) {
        await prisma.purchaseInvoice.update({
          where: { id: inv.id },
          data: {
            subtotal: target,
            total_amount: target,
            status,
            notes: `${inv.notes || ""};ledger_aligned=1`.replace(/;ledger_aligned=1/g, "") + ";ledger_aligned=1",
          },
        });
        invUpdated++;
      }
    }
    console.log("Purchase invoices aligned to supplier ledger:", invUpdated);

    // ---- 3) Recompute sale payment_received from customer ledger sale_payment rows ----
    const paidByRef = new Map<string, number>();
    for (const r of customerLedger) {
      if (clean(r.reference_type) !== "sale_payment") continue;
      const narration = clean(r.narration);
      const m = narration.match(/(SALE\/POS\/\d{4}\/\d{2}\/\d+)/i);
      if (!m) continue;
      const ref = m[1].toUpperCase();
      paidByRef.set(ref, (paidByRef.get(ref) || 0) + num(r.credit));
    }

    // Map sale_number -> expected payment
    const saleRefByOldId = new Map<string, string>();
    const saleGroups = new Map<string, Record<string, string>[]>();
    for (const r of sales) {
      if (num(r.quantity) <= 0) continue;
      if (clean(r.sale_status).toLowerCase() === "returned") continue;
      const sid = clean(r.sale_id);
      if (!saleGroups.has(sid)) saleGroups.set(sid, []);
      saleGroups.get(sid)!.push(r);
      saleRefByOldId.set(sid, clean(r.reference_no).toUpperCase());
    }

    const dbSales = await prisma.sale.findMany({
      where: { notes: { contains: "legacy_sale_id=" } },
      select: { id: true, notes: true, sale_number: true, total_amount: true, payment_received: true, payment_status: true },
    });

    let salesUpdated = 0;
    for (const s of dbSales) {
      const m = (s.notes || "").match(/legacy_sale_id=(\d+)/);
      if (!m) continue;
      const ref = (saleRefByOldId.get(m[1]) || s.sale_number || "").toUpperCase();
      const total = Number(s.total_amount);
      const lines = saleGroups.get(m[1]);
      const statusRaw = lines ? clean(lines[0].payment_status).toLowerCase() : "";

      let received = paidByRef.has(ref) ? paidByRef.get(ref)! : statusRaw === "paid" ? total : 0;
      if (received > total) received = total;
      if (statusRaw === "due") received = paidByRef.get(ref) || 0;

      let paymentStatus: PaymentStatus = PaymentStatus.PAID;
      if (received <= 0.009) paymentStatus = PaymentStatus.PENDING;
      else if (received + 0.009 < total) paymentStatus = PaymentStatus.PARTIAL;
      else paymentStatus = PaymentStatus.PAID;

      if (
        Math.abs(Number(s.payment_received) - received) > 0.009 ||
        s.payment_status !== paymentStatus
      ) {
        await prisma.sale.update({
          where: { id: s.id },
          data: { payment_received: received, payment_status: paymentStatus },
        });
        // refresh SalePayment split tender row
        await prisma.salePayment.deleteMany({ where: { sale_id: s.id } });
        if (received > 0.009) {
          await prisma.salePayment.create({
            data: { sale_id: s.id, method: "CASH", amount: received },
          });
        }
        salesUpdated++;
      }
    }
    console.log("Sales payment_received updated:", salesUpdated);

    // ---- 4) For paid returns, set payment_received = total_amount (negative) already;
    //         add CustomerPayment REFUND only when needed? Instead: zero-out return
    //         payment_received and rely on return total for ledger; for paid original
    //         sales the store owes customer after return — create REFUND customer payment
    //         equal to abs(return) so net balance matches old POS (usually 0).
    const dbReturns = await prisma.sale.findMany({
      where: { notes: { contains: "legacy_return_id=" } },
      select: {
        id: true,
        notes: true,
        total_amount: true,
        payment_received: true,
        customer_id: true,
        sale_date: true,
        created_by: true,
        original_sale_id: true,
        original_sale: { select: { payment_received: true, total_amount: true, payment_status: true } },
      },
    });

    // Build CSV return meta
    const retMeta = new Map<string, { pay: string; originalSaleId: string }>();
    for (const r of salesReturns) {
      retMeta.set(clean(r.return_id), {
        pay: clean(r.payment_status).toLowerCase(),
        originalSaleId: clean(r.original_sale_id),
      });
    }

    const admin = await prisma.user.findFirst({ orderBy: { created_at: "asc" } });
    if (!admin) throw new Error("No admin user");

    await prisma.customerPayment.deleteMany({
      where: { notes: { contains: "legacy_return_refund=" } },
    });

    let refunds = 0;
    for (const ret of dbReturns) {
      const m = (ret.notes || "").match(/legacy_return_id=(\d+)/);
      if (!m || !ret.customer_id) continue;
      const meta = retMeta.get(m[1]);
      const status = meta?.pay || "paid";
      const absAmt = Math.abs(Number(ret.total_amount));

      // Return doc itself: no payment_received (return total_amount carries the credit)
      await prisma.sale.update({
        where: { id: ret.id },
        data: {
          payment_received: 0,
          payment_status: status === "partial" ? PaymentStatus.PARTIAL : PaymentStatus.PAID,
        },
      });

      // Only cash-refund when the original sale had been paid (otherwise return just
      // clears the receivable and old ledger ends at 0 without a refund row).
      const orig = ret.original_sale;
      const origPaid =
        !!orig &&
        (orig.payment_status === "PAID" ||
          Number(orig.payment_received) + 0.009 >= Number(orig.total_amount));

      if (origPaid && (status === "paid" || status === "partial")) {
        await prisma.customerPayment.create({
          data: {
            customer_id: ret.customer_id,
            type: "REFUND",
            sale_id: ret.id,
            amount: absAmt,
            payment_date: ret.sale_date,
            method: "CASH",
            reference: `RET/${m[1]}`,
            notes: `legacy_return_refund=${m[1]}`,
            created_by: admin.id,
          },
        });
        refunds++;
      }
    }
    console.log("Return refund payments created:", refunds);

    // ---- 5) Tag alias product ids on existing products for verify map completeness ----
    // 486 -> PA-0001 (24144), 23526 -> MNR-NZN-U (24166), 24122 -> 26-106-U (24141)
    const aliases: Array<[string, string]> = [
      ["486", "PA-0001"],
      ["23526", "MNR-NZN-U"],
      ["24122", "26-106-U"],
    ];
    for (const [oldId, code] of aliases) {
      const prod = await prisma.product.findFirst({ where: { code } });
      if (!prod) continue;
      const desc = prod.description || "";
      if (!desc.includes(`alias_product_id=${oldId}`)) {
        await prisma.product.update({
          where: { id: prod.id },
          data: { description: `${desc};alias_product_id=${oldId}`.replace(/^;/, "") },
        });
        console.log("Tagged alias", oldId, "->", code);
      }
    }

    console.log("Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
