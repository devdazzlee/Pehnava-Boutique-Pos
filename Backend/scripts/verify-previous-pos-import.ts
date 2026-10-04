/**
 * Deep reconcile Previous Pos Data CSVs vs PRODUCTION DB.
 * Usage:
 *   npx ts-node scripts/verify-previous-pos-import.ts --i-confirm-production
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function readCsv(fileName: string): Record<string, string>[] {
  const full = path.join(DATA, fileName);
  const buf = fs.readFileSync(full);
  const preferLatin1 = /pUrchase|All pUrchase/i.test(fileName);
  let text = preferLatin1 ? buf.toString("latin1") : buf.toString("utf8");
  if (!preferLatin1 && text.includes("\uFFFD")) text = buf.toString("latin1");
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

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  loadEnv();
  if (!process.argv.includes("--i-confirm-production")) {
    throw new Error("Need --i-confirm-production");
  }
  const url = process.env.PRODUCTION_DATABASE_URL || "";
  if (!url || url.includes("neon.tech")) {
    throw new Error("PRODUCTION_DATABASE_URL required (not Neon)");
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const issues: string[] = [];
  const ok: string[] = [];

  try {
    const products = readCsv("Product List.csv");
    const customers = readCsv("Customer.csv");
    const suppliers = readCsv("Suppliers.csv");
    const sales = readCsv("All Sales.csv");
    const salesReturns = readCsv("All Sales Return.csv");
    const purchases = readCsv("All pUrchase.csv");
    const purchaseReturns = readCsv("All Puchase Return.csv");
    const expenses = readCsv("Expense Sheet.csv");
    const customerLedger = readCsv("Customer Ledger.csv");
    const supplierLedger = readCsv("Supplier Ledger.csv");

    // ---------- PRODUCTS ----------
    section("PRODUCTS");
    const csvProductIds = new Set(products.map((r) => clean(r.product_id)).filter(Boolean));
    const csvCodes = new Set(products.map((r) => clean(r.product_code)).filter(Boolean));
    const dbProducts = await prisma.product.findMany({
      select: { id: true, code: true, sku: true, description: true, purchase_rate: true, sales_rate_inc_dis_and_tax: true },
    });
    const dbLegacyPid = new Map<string, string>();
    for (const p of dbProducts) {
      const m = (p.description || "").match(/legacy_product_id=(\d+)/);
      if (m) dbLegacyPid.set(m[1], p.id);
      const a = (p.description || "").match(/alias_product_id=(\d+)/);
      if (a) dbLegacyPid.set(a[1], p.id);
    }
    const missingProductIds = [...csvProductIds].filter((id) => !dbLegacyPid.has(id));
    const dbByCode = new Set(dbProducts.map((p) => p.code));
    const missingCodes = [...csvCodes].filter((c) => !dbByCode.has(c) && !dbByCode.has(`${c}-${[...csvProductIds].find((id) => products.find((r) => clean(r.product_id) === id && clean(r.product_code) === c))}`));
    // simpler code check
    let missingCodeCount = 0;
    const missingCodeSamples: string[] = [];
    for (const r of products) {
      const code = clean(r.product_code);
      const oldId = clean(r.product_id);
      if (!code) continue;
      if (!dbByCode.has(code) && !dbByCode.has(`${code}-${oldId}`) && !dbLegacyPid.has(oldId)) {
        missingCodeCount++;
        if (missingCodeSamples.length < 10) missingCodeSamples.push(code);
      }
    }
    console.log(`CSV products: ${products.length} | DB products: ${dbProducts.length} | legacy-mapped: ${dbLegacyPid.size}`);
    console.log(`Missing legacy product_ids: ${missingProductIds.length}`, missingProductIds.slice(0, 10));
    console.log(`Missing codes: ${missingCodeCount}`, missingCodeSamples);
    if (missingProductIds.length) issues.push(`Products missing by legacy id: ${missingProductIds.length}`);
    else ok.push(`All ${products.length} Product List rows present by legacy id`);

    // Stock qty
    const csvStock = products.reduce((s, r) => s + num(r.current_stock), 0);
    const stockAgg = await prisma.stock.aggregate({ _sum: { current_quantity: true }, _count: true });
    const dbStock = Number(stockAgg._sum.current_quantity || 0);
    console.log(`Stock qty CSV: ${csvStock} | DB: ${dbStock} | stock rows: ${stockAgg._count}`);
    if (Math.abs(csvStock - dbStock) > 0.5) issues.push(`Stock qty mismatch CSV=${csvStock} DB=${dbStock}`);
    else ok.push(`Stock quantity matches (${dbStock})`);

    // ---------- CUSTOMERS ----------
    section("CUSTOMERS");
    const csvCustIds = customers.map((r) => clean(r.customer_id)).filter(Boolean);
    const dbCust = await prisma.customer.findMany({ select: { id: true, notes: true, name: true } });
    const dbCustMap = new Map<string, string>();
    for (const c of dbCust) {
      const m = (c.notes || "").match(/(?:^|;\s*)legacy_customer_id=(\d+)(?:;|$)/);
      if (m) dbCustMap.set(m[1], c.id);
    }
    const missingCust = csvCustIds.filter((id) => !dbCustMap.has(id));
    console.log(`CSV customers: ${csvCustIds.length} | DB legacy-mapped: ${dbCustMap.size} | DB total: ${dbCust.length}`);
    console.log(`Missing customers: ${missingCust.length}`, missingCust.slice(0, 20));
    if (missingCust.length) issues.push(`Customers missing: ${missingCust.length} (${missingCust.slice(0, 10).join(",")})`);
    else ok.push(`All ${csvCustIds.length} customers present`);

    // ---------- SUPPLIERS ----------
    section("SUPPLIERS");
    const csvSupIds = new Set(suppliers.map((r) => clean(r.supplier_id)).filter(Boolean));
    // also from purchases
    for (const r of purchases) if (clean(r.supplier_id)) csvSupIds.add(clean(r.supplier_id));
    const dbSup = await prisma.supplier.findMany({ select: { id: true, code: true, name: true } });
    const dbSupMap = new Map<string, string>();
    for (const s of dbSup) {
      const m = s.code.match(/^LSUP-(\d+)$/);
      if (m) dbSupMap.set(m[1], s.id);
    }
    const missingSup = [...csvSupIds].filter((id) => !dbSupMap.has(id));
    console.log(`CSV supplier ids (file+purchases): ${csvSupIds.size} | DB: ${dbSupMap.size}`);
    console.log(`Missing suppliers: ${missingSup.length}`, missingSup);
    if (missingSup.length) issues.push(`Suppliers missing: ${missingSup.join(",")}`);
    else ok.push(`All ${csvSupIds.size} suppliers present`);

    // ---------- SALES ----------
    section("SALES");
    const saleGroups = new Map<string, Record<string, string>[]>();
    for (const r of sales) {
      if (num(r.quantity) <= 0) continue;
      if (clean(r.sale_status).toLowerCase() === "returned") continue;
      const sid = clean(r.sale_id);
      if (!saleGroups.has(sid)) saleGroups.set(sid, []);
      saleGroups.get(sid)!.push(r);
    }
    const dbSales = await prisma.sale.findMany({
      where: { notes: { contains: "legacy_sale_id=" } },
      select: {
        id: true,
        notes: true,
        sale_number: true,
        total_amount: true,
        payment_received: true,
        payment_status: true,
        customer_id: true,
        sale_items: { select: { quantity: true, line_total: true, product_id: true } },
      },
    });
    const dbSaleMap = new Map<string, (typeof dbSales)[0]>();
    for (const s of dbSales) {
      const m = (s.notes || "").match(/legacy_sale_id=(\d+)/);
      if (m) dbSaleMap.set(m[1], s);
    }
    const missingSales = [...saleGroups.keys()].filter((id) => !dbSaleMap.has(id));
    console.log(`CSV sale groups (eligible): ${saleGroups.size} | DB legacy sales: ${dbSaleMap.size}`);
    console.log(`Missing sales: ${missingSales.length}`, missingSales.slice(0, 20));
    if (missingSales.length) issues.push(`Sales missing: ${missingSales.length}`);
    else ok.push(`All ${saleGroups.size} sales present`);

    // sale line counts
    let csvSaleLines = 0;
    for (const lines of saleGroups.values()) csvSaleLines += lines.length;
    const dbSaleItemCount = dbSales.reduce((n, s) => n + s.sale_items.length, 0);
    console.log(`CSV sale lines: ${csvSaleLines} | DB sale items (legacy sales): ${dbSaleItemCount}`);
    if (csvSaleLines !== dbSaleItemCount) {
      issues.push(`Sale line count mismatch CSV=${csvSaleLines} DB=${dbSaleItemCount}`);
    } else ok.push(`Sale line counts match (${csvSaleLines})`);

    // totals
    let csvSaleTotal = 0;
    for (const [, lines] of saleGroups) {
      const grand = Math.abs(num(lines[0].grand_total));
      const lineSum = lines.reduce((s, l) => s + num(l.sale_amount), 0);
      csvSaleTotal += grand > 0 ? grand : lineSum;
    }
    const dbSaleTotal = dbSales.reduce((s, x) => s + Number(x.total_amount), 0);
    console.log(`Sale totals CSV≈${csvSaleTotal.toFixed(2)} | DB=${dbSaleTotal.toFixed(2)} | diff=${(dbSaleTotal - csvSaleTotal).toFixed(2)}`);
    if (Math.abs(dbSaleTotal - csvSaleTotal) > 1) {
      issues.push(`Sale total mismatch CSV=${csvSaleTotal.toFixed(2)} DB=${dbSaleTotal.toFixed(2)}`);
    } else ok.push(`Sale totals align (diff < 1)`);

    // customer link correctness sample
    let wrongCust = 0;
    for (const [sid, lines] of saleGroups) {
      const db = dbSaleMap.get(sid);
      if (!db) continue;
      const expect = dbCustMap.get(clean(lines[0].customer_id)) || null;
      if (db.customer_id !== expect) wrongCust++;
    }
    console.log(`Sales with wrong customer_id: ${wrongCust}`);
    if (wrongCust) issues.push(`Sales wrong customer links: ${wrongCust}`);
    else ok.push("Sale customer links correct");

    // ---------- SALE RETURNS ----------
    section("SALE RETURNS");
    const retGroups = new Map<string, Record<string, string>[]>();
    for (const r of salesReturns) {
      const rid = clean(r.return_id);
      if (!rid) continue;
      if (!retGroups.has(rid)) retGroups.set(rid, []);
      retGroups.get(rid)!.push(r);
    }
    const dbRets = await prisma.sale.findMany({
      where: { notes: { contains: "legacy_return_id=" } },
      select: {
        id: true,
        notes: true,
        total_amount: true,
        customer_id: true,
        original_sale_id: true,
        sale_items: { select: { id: true, quantity: true, line_total: true } },
      },
    });
    const dbRetMap = new Map<string, (typeof dbRets)[0]>();
    for (const s of dbRets) {
      const m = (s.notes || "").match(/legacy_return_id=(\d+)/);
      if (m) dbRetMap.set(m[1], s);
    }
    const missingRets = [...retGroups.keys()].filter((id) => !dbRetMap.has(id));
    let csvRetLines = 0;
    for (const lines of retGroups.values()) csvRetLines += lines.length;
    const dbRetLines = dbRets.reduce((n, s) => n + s.sale_items.length, 0);
    console.log(`CSV return groups: ${retGroups.size} lines: ${csvRetLines} | DB: ${dbRetMap.size} items: ${dbRetLines}`);
    console.log(`Missing returns: ${missingRets.length}`, missingRets);
    if (missingRets.length) issues.push(`Sale returns missing: ${missingRets.join(",")}`);
    else ok.push(`All ${retGroups.size} sale returns present`);
    if (csvRetLines !== dbRetLines) issues.push(`Return line mismatch CSV=${csvRetLines} DB=${dbRetLines}`);
    else ok.push(`Return lines match (${csvRetLines})`);

    let retWrongCust = 0;
    let retMissingOriginal = 0;
    for (const [rid, lines] of retGroups) {
      const db = dbRetMap.get(rid);
      if (!db) continue;
      const expect = dbCustMap.get(clean(lines[0].customer_id)) || null;
      if (db.customer_id !== expect) retWrongCust++;
      const orig = clean(lines[0].original_sale_id);
      if (orig && saleGroups.has(orig) && !db.original_sale_id) retMissingOriginal++;
    }
    console.log(`Returns wrong customer: ${retWrongCust} | missing original_sale link: ${retMissingOriginal}`);
    if (retWrongCust) issues.push(`Return wrong customer: ${retWrongCust}`);
    else ok.push("Return customer links correct");

    // ---------- PURCHASES ----------
    section("PURCHASES");
    const purchGroups = new Map<string, Record<string, string>[]>();
    for (const r of purchases) {
      if (clean(r.status).toLowerCase() === "returned") continue;
      if (num(r.quantity) <= 0) continue;
      const pid = clean(r.purchase_id);
      if (!pid) continue;
      if (!purchGroups.has(pid)) purchGroups.set(pid, []);
      purchGroups.get(pid)!.push(r);
    }
    let csvPurchLines = 0;
    let csvPurchAmt = 0;
    for (const lines of purchGroups.values()) {
      csvPurchLines += lines.length;
      for (const l of lines) csvPurchAmt += num(l.quantity) * num(l.net_unit_cost || l.unit_cost);
    }
    const dbPurch = await prisma.purchase.findMany({
      where: { notes: { contains: "legacy_purchase_id=" } },
      select: { id: true, notes: true, quantity: true, cost_price: true, purchase_invoice_id: true, product_id: true },
    });
    const dbPurchIds = new Set<string>();
    for (const p of dbPurch) {
      const m = (p.notes || "").match(/legacy_purchase_id=(\d+)/);
      if (m) dbPurchIds.add(m[1]);
    }
    const missingPurchGroups = [...purchGroups.keys()].filter((id) => !dbPurchIds.has(id));
    const dbPurchAmt = dbPurch.reduce((s, p) => s + Number(p.quantity) * Number(p.cost_price), 0);
    const invCount = await prisma.purchaseInvoice.count({ where: { notes: { contains: "legacy_purchase_id=" } } });
    console.log(`CSV purchase groups: ${purchGroups.size} lines: ${csvPurchLines} amt: ${csvPurchAmt.toFixed(2)}`);
    console.log(`DB purchase lines: ${dbPurch.length} groups-mapped: ${dbPurchIds.size} invoices: ${invCount} amt: ${dbPurchAmt.toFixed(2)}`);
    console.log(`Missing purchase groups: ${missingPurchGroups.length}`, missingPurchGroups.slice(0, 20));
    if (missingPurchGroups.length) issues.push(`Purchase groups missing: ${missingPurchGroups.length}`);
    else ok.push(`All ${purchGroups.size} purchase groups present`);
    // +1 purchase/invoice allowed: restored legacy purchase 106 for DELETE return 105
    const purchLineDelta = dbPurch.length - csvPurchLines;
    const invDelta = invCount - purchGroups.size;
    if (purchLineDelta !== 0 && purchLineDelta !== 1) {
      issues.push(`Purchase lines CSV=${csvPurchLines} DB=${dbPurch.length}`);
    } else ok.push(`Purchase lines OK (CSV ${csvPurchLines}, DB ${dbPurch.length}${purchLineDelta === 1 ? ", +1 restored #106" : ""})`);
    if (Math.abs(csvPurchAmt - dbPurchAmt) > 1 && Math.abs(csvPurchAmt + 8650 - dbPurchAmt) > 1) {
      issues.push(`Purchase amount mismatch CSV=${csvPurchAmt} DB=${dbPurchAmt}`);
    } else ok.push(`Purchase amounts OK (DB ${dbPurchAmt.toFixed(2)})`);
    if (invDelta !== 0 && invDelta !== 1) {
      issues.push(`Invoice count ${invCount} != purchase groups ${purchGroups.size}`);
    } else ok.push(`Purchase invoices OK (${invCount})`);

    // purchase products resolvable
    let purchUnresolved = 0;
    for (const lines of purchGroups.values()) {
      for (const l of lines) {
        const oid = clean(l.product_id);
        const code = clean(l.product_code);
        const name = clean(l.product_name);
        if (oid && dbLegacyPid.has(oid)) continue;
        if (code && dbByCode.has(code)) continue;
        // may be stub created without legacy id in description for empty product_id
        if (!oid && !code && name) {
          const found = await prisma.product.findFirst({ where: { name } });
          if (!found) purchUnresolved++;
        } else if (oid && !dbLegacyPid.has(oid)) {
          // stub should still exist with description
          purchUnresolved++;
        }
      }
    }
    // cheaper unresolved check using already loaded data
    purchUnresolved = 0;
    const unresolvedSamples: string[] = [];
    for (const lines of purchGroups.values()) {
      for (const l of lines) {
        const oid = clean(l.product_id);
        if (oid) {
          if (!dbLegacyPid.has(oid)) {
            purchUnresolved++;
            if (unresolvedSamples.length < 10) unresolvedSamples.push(`pid=${oid}`);
          }
          continue;
        }
        const code = clean(l.product_code);
        if (code && dbByCode.has(code)) continue;
        const name = clean(l.product_name);
        if (name && dbProducts.some((p) => p.code && p.sku)) {
          // name match deferred
        }
        // count empty-id lines that have no code match
        if (!code) {
          // accept if name exists in DB
          // checked below in batch
        }
      }
    }
    const emptyPidLines = purchases.filter(
      (r) => clean(r.status).toLowerCase() !== "returned" && num(r.quantity) > 0 && !clean(r.product_id),
    );
    let emptyPidMissing = 0;
    for (const l of emptyPidLines) {
      const code = clean(l.product_code);
      const name = clean(l.product_name);
      const found =
        (code && dbByCode.has(code)) ||
        (name
          ? await prisma.product.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } })
          : null);
      if (!found) {
        emptyPidMissing++;
        if (unresolvedSamples.length < 15) unresolvedSamples.push(`name=${name.slice(0, 60)}`);
      }
    }
    console.log(`Purchase lines with empty product_id: ${emptyPidLines.length} | still unresolved: ${emptyPidMissing}`);
    console.log(`Purchase product_id missing from product map: ${purchUnresolved}`, unresolvedSamples);
    if (purchUnresolved) issues.push(`Purchase lines reference unknown product_id: ${purchUnresolved}`);
    if (emptyPidMissing) issues.push(`Purchase lines with empty product_id unresolved: ${emptyPidMissing}`);
    if (!purchUnresolved && !emptyPidMissing) ok.push("All purchase lines resolve to products");

    // ---------- PURCHASE RETURNS ----------
    section("PURCHASE RETURNS");
    const prGroups = new Set(purchaseReturns.map((r) => clean(r.return_id)).filter(Boolean));
    const dbPr = await prisma.purchaseReturn.findMany({
      where: { notes: { contains: "legacy_purchase_return_id=" } },
      include: { items: true },
    });
    const dbPrIds = new Set(
      dbPr.map((r) => (r.notes || "").match(/legacy_purchase_return_id=(\d+)/)?.[1]).filter(Boolean) as string[],
    );
    const missingPr = [...prGroups].filter((id) => !dbPrIds.has(id));
    console.log(`CSV PR groups: ${prGroups.size} | DB: ${dbPrIds.size} items: ${dbPr.reduce((n, r) => n + r.items.length, 0)}`);
    console.log(`Missing PR: ${missingPr.length}`, missingPr);
    if (missingPr.length) issues.push(`Purchase returns missing: ${missingPr.join(",")}`);
    else ok.push(`All ${prGroups.size} purchase returns present`);

    // ---------- EXPENSES ----------
    section("EXPENSES");
    const csvExp = expenses.filter((r) => num(r.amount) > 0);
    const csvExpAmt = csvExp.reduce((s, r) => s + num(r.amount), 0);
    const dbExp = await prisma.expense.findMany({
      where: { notes: { contains: "legacy_expense_id=" } },
      select: { id: true, notes: true, amount: true },
    });
    const dbExpIds = new Set(
      dbExp.map((e) => (e.notes || "").match(/legacy_expense_id=(\d+)/)?.[1]).filter(Boolean) as string[],
    );
    const missingExp = csvExp.map((r) => clean(r.expense_id)).filter((id) => id && !dbExpIds.has(id));
    const dbExpAmt = dbExp.reduce((s, e) => s + Number(e.amount), 0);
    console.log(`CSV expenses: ${csvExp.length} amt ${csvExpAmt} | DB: ${dbExp.length} amt ${dbExpAmt}`);
    console.log(`Missing expenses: ${missingExp.length}`, missingExp.slice(0, 20));
    if (missingExp.length) issues.push(`Expenses missing: ${missingExp.length}`);
    else ok.push(`All ${csvExp.length} expenses present`);
    if (Math.abs(csvExpAmt - dbExpAmt) > 0.5) issues.push(`Expense amount mismatch`);
    else ok.push(`Expense amounts match (${dbExpAmt})`);

    // ---------- LEDGERS (informational + balance check) ----------
    section("CUSTOMER LEDGER / BALANCES");
    // final running balance per customer from CSV
    const csvBal = new Map<string, number>();
    for (const r of customerLedger) {
      csvBal.set(clean(r.customer_id), num(r.running_balance));
    }
    // DB approx: sum(sale totals - payment_received) + abs(return credits) style via payments/sales
    // Use same logic as customer accounts roughly: for each customer with legacy sales
    let balMismatch = 0;
    const balSamples: string[] = [];
    for (const [custOld, csvBalance] of csvBal) {
      const custId = dbCustMap.get(custOld);
      if (!custId) continue;
      const custSales = await prisma.sale.findMany({
        where: { customer_id: custId, status: "COMPLETED" },
        select: { total_amount: true, payment_received: true },
      });
      const custRets = await prisma.sale.findMany({
        where: { customer_id: custId, status: "REFUNDED" },
        select: { total_amount: true },
      });
      const custPays = await prisma.customerPayment.findMany({
        where: { customer_id: custId },
        select: { type: true, amount: true },
      });
      const custRow = await prisma.customer.findUnique({
        where: { id: custId },
        select: { previous_credit_balance: true },
      });
      // Mirror customer.service: opening + sales/received + return credit + payments
      let due = Number(custRow?.previous_credit_balance || 0);
      for (const s of custSales) due += Number(s.total_amount) - Number(s.payment_received);
      for (const r of custRets) due += Number(r.total_amount); // negative reduces due
      for (const pay of custPays) {
        const amt = Number(pay.amount);
        if (pay.type === "REFUND" || pay.type === "DEBIT_NOTE") due += amt;
        else due -= amt;
      }
      if (Math.abs(due - csvBalance) > 5) {
        balMismatch++;
        if (balSamples.length < 15) {
          balSamples.push(`cust ${custOld}: csv=${csvBalance.toFixed(2)} db≈${due.toFixed(2)}`);
        }
      }
    }
    const csvNonZero = [...csvBal.values()].filter((v) => Math.abs(v) > 0.01).length;
    console.log(`Customer ledger rows: ${customerLedger.length} | customers with CSV balance: ${csvBal.size} (nonzero ${csvNonZero})`);
    console.log(`Balance mismatches (>Rs5): ${balMismatch}`);
    for (const s of balSamples) console.log("  ", s);
    if (balMismatch) issues.push(`Customer balance mismatches: ${balMismatch} (see samples; payment mapping may differ)`);
    else ok.push("Customer balances align with ledger");

    section("SUPPLIER LEDGER / BALANCES");
    const csvSupBal = new Map<string, number>();
    for (const r of supplierLedger) {
      csvSupBal.set(clean(r.supplier_id), num(r.running_balance));
    }
    let supMismatch = 0;
    const supSamples: string[] = [];
    for (const [supOld, csvBalance] of csvSupBal) {
      const supId = dbSupMap.get(supOld);
      if (!supId) continue;
      const inv = await prisma.purchaseInvoice.findMany({
        where: { supplier_id: supId },
        select: { total_amount: true, amount_paid: true },
      });
      const rets = await prisma.purchaseReturn.findMany({
        where: { supplier_id: supId },
        select: { total_amount: true },
      });
      let due = 0;
      for (const i of inv) due += Number(i.total_amount) - Number(i.amount_paid);
      for (const r of rets) due -= Number(r.total_amount);
      if (Math.abs(due - csvBalance) > 5) {
        supMismatch++;
        if (supSamples.length < 10) {
          supSamples.push(`sup ${supOld}: csv=${csvBalance.toFixed(2)} db≈${due.toFixed(2)}`);
        }
      }
    }
    console.log(`Supplier ledger rows: ${supplierLedger.length} | suppliers with balance: ${csvSupBal.size}`);
    console.log(`Balance mismatches (>Rs5): ${supMismatch}`);
    for (const s of supSamples) console.log("  ", s);
    if (supMismatch) issues.push(`Supplier balance mismatches: ${supMismatch}`);
    else ok.push("Supplier balances align with ledger");

    // ---------- ORPHAN / EXTRA CHECKS ----------
    section("CROSS-FILE PRODUCT COVERAGE");
    const referencedProductIds = new Set<string>();
    for (const r of [...sales, ...salesReturns, ...purchases, ...purchaseReturns]) {
      const id = clean(r.product_id);
      if (id) referencedProductIds.add(id);
    }
    const missingRefProducts = [...referencedProductIds].filter((id) => !dbLegacyPid.has(id) && !csvProductIds.has(id));
    // stubs for ids not in product list should still be in dbLegacyPid if imported with description
    const refNotInDb = [...referencedProductIds].filter((id) => !dbLegacyPid.has(id));
    console.log(`Product ids referenced in txns: ${referencedProductIds.size}`);
    console.log(`Referenced but not in Product List: ${[...referencedProductIds].filter((id) => !csvProductIds.has(id)).length}`);
    console.log(`Referenced but not in DB legacy map: ${refNotInDb.length}`, refNotInDb.slice(0, 20));
    if (refNotInDb.length) issues.push(`Txn product_ids missing in DB: ${refNotInDb.join(",")}`);
    else ok.push("All txn product_ids exist in DB");

    // Skipped rows intentionally
    section("INTENTIONALLY SKIPPED CSV ROWS");
    const skippedSaleNeg = sales.filter((r) => num(r.quantity) <= 0).length;
    const skippedSaleReturned = sales.filter((r) => clean(r.sale_status).toLowerCase() === "returned" && num(r.quantity) > 0).length;
    const skippedPurchRet = purchases.filter((r) => clean(r.status).toLowerCase() === "returned" || num(r.quantity) <= 0).length;
    console.log(`All Sales negative/zero qty lines (covered by Sales Return file): ${skippedSaleNeg}`);
    console.log(`All Sales status=returned positive qty: ${skippedSaleReturned}`);
    console.log(`All Purchase returned/non-positive lines (covered by Purchase Return file): ${skippedPurchRet}`);
    console.log(`Customer Ledger rows: ${customerLedger.length} (used for payment amounts / balance verify, not stored as JV rows)`);
    console.log(`Supplier Ledger rows: ${supplierLedger.length} (balances derived from purchases/returns; no payment rows in CSV)`);

    // ---------- SUMMARY ----------
    section("SUMMARY");
    console.log(`OK (${ok.length}):`);
    for (const x of ok) console.log(`  ✓ ${x}`);
    console.log(`ISSUES (${issues.length}):`);
    for (const x of issues) console.log(`  ✗ ${x}`);
    if (issues.length) {
      console.log("\nRESULT: GAPS FOUND — see ISSUES above");
      process.exitCode = 2;
    } else {
      console.log("\nRESULT: COMPLETE — no missing transactional/master rows vs CSVs");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
