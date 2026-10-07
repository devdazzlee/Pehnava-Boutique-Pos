// Shared receipt rendering — used by sales-history and returns screens so a
// receipt looks identical across the app (HTML preview + WhatsApp PDF +
// browser print).

import { type ReceiptData, type ReceiptItem, type ReceiptSection, type ReceiptSummaryLine } from "@/lib/print-server";
import { parseReturnNotes, formatSettlementLabel } from "@/components/returns/utils";
import {
  ACE_STUDIOS_CONTACT,
  PEHNAWA_DEFAULT_STORE_ADDRESS,
} from "@/config/constants";

export type { ReceiptData, ReceiptItem, ReceiptSection, ReceiptSummaryLine };

// Loose Sale shape — both Sale (sales-history) and ReturnItem (returns)
// satisfy this. Anything optional is `?` so callers don't have to fill in
// fields they don't have.
export interface ReceiptSourceSale {
  id?: string;
  sale_number?: string | null;
  sale_date?: string | null;
  created_at?: string | null;
  subtotal?: string | number | null;
  total_amount?: string | number | null;
  discount_amount?: string | number | null;
  tax_amount?: string | number | null;
  payment_method?: string | null;
  notes?: string | null;
  customer?: {
    name?: string | null;
    email?: string | null;
    phone_number?: string | null;
    mobile_number?: string | null;
    phone?: string | null;
  } | null;
  user?: { email?: string | null } | null;
  salesperson?: { name?: string | null } | null;
  branch?: { name?: string | null; address?: string | null } | null;
  sale_items?: Array<{
    product?: { name?: string | null; sku?: string | null } & Record<string, any>;
    quantity?: number | null;
    unit_price?: string | number | null;
    line_total?: string | number | null;
    item_type?: string | null;
  }> | null;
  original_sale_id?: string | null;
  original_sale?: { sale_number?: string | null; total_amount?: string | number | null } | null;
  status?: string | null;
}

export interface BranchInfoFallback {
  name: string;
  address: string;
}

export const buildReceiptBranchLine = (
  storeName?: string,
  _address?: string,
): string => {
  const name = typeof storeName === "string" ? storeName.trim() : "";
  const address =
    typeof _address === "string" && _address.trim()
      ? _address.trim()
      : PEHNAWA_DEFAULT_STORE_ADDRESS;
  if (!name || ["ADMIN", "MANPASAND GENERAL STORE", "PEHNAWA BOUTIQUE"].includes(name.toUpperCase())) {
    return address;
  }
  if (address.toLowerCase().includes(name.toLowerCase())) return address;
  return `${name}, ${address}`;
};

const num = (v: any): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
};

const money = (n: number) =>
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Short thermal-friendly QTY parts.
 * - Abbreviate units: Kgs→Kg, Pieces→Pcs
 * - For fractional kg (< 1), show grams ("10 g") so QTY stays one short line
 *   like old receipts ("1 Kg") instead of wrapping "0.01 Kg".
 * Caller must pass lineTotal when quantity is converted (g vs kg) so RATE stays correct.
 */
export const formatReceiptQtyParts = (
  quantity: number,
  unitName?: string | null,
): { quantity: number; unit?: string; converted?: boolean } => {
  const qty = Number(quantity);
  const safeQty = Number.isFinite(qty) ? Math.abs(qty) : 0;
  const displayQty = Number.isInteger(safeQty)
    ? safeQty
    : parseFloat(safeQty.toFixed(3));

  const raw = typeof unitName === "string" ? unitName.trim() : "";
  if (!raw) return { quantity: displayQty };

  const unitLower = raw.toLowerCase();

  if (unitLower.includes("kg") || unitLower.includes("kilogram")) {
    if (safeQty > 0 && safeQty < 1) {
      return {
        quantity: Math.round(safeQty * 1000),
        unit: "g",
        converted: true,
      };
    }
    return { quantity: displayQty, unit: "Kg" };
  }
  if (unitLower === "g" || unitLower === "gram" || unitLower === "grams") {
    if (safeQty >= 1000) {
      const kg = safeQty / 1000;
      return {
        quantity: Number.isInteger(kg) ? kg : parseFloat(kg.toFixed(3)),
        unit: "Kg",
        converted: true,
      };
    }
    return { quantity: Math.round(safeQty) || displayQty, unit: "g" };
  }
  if (unitLower.includes("pc") || unitLower.includes("piece")) {
    const whole = Number.isInteger(safeQty) ? safeQty : parseFloat(safeQty.toFixed(3));
    return { quantity: whole, unit: "Pcs" };
  }

  const short = raw.length > 4 ? raw.replace(/s$/i, "").slice(0, 3) : raw;
  return { quantity: displayQty, unit: short };
};

export const formatReceiptQtyLabel = (
  quantity: number,
  unitName?: string | null,
): string => {
  const parts = formatReceiptQtyParts(quantity, unitName);
  return parts.unit ? `${parts.quantity} ${parts.unit}` : String(parts.quantity);
};

export const prepareReceiptDataFromSale = (
  sale: ReceiptSourceSale,
  branch: BranchInfoFallback,
  opts?: { transactionLabel?: string; itemFilter?: (item: NonNullable<ReceiptSourceSale["sale_items"]>[number]) => boolean },
): ReceiptData => {
  const allItems = sale.sale_items || [];
  const items = (opts?.itemFilter ? allItems.filter(opts.itemFilter) : allItems).map((item) => {
    const rawQty = Math.abs(num(item.quantity) || 1);
    const lineTotalRaw = num(item.line_total);
    const unitPrice =
      item.unit_price != null
        ? Math.abs(num(item.unit_price))
        : Math.abs(lineTotalRaw) / Math.max(1, rawQty);
    const unitLabel =
      (item.product as any)?.unit?.name ||
      (item.product as any)?.unit_name ||
      (item as any)?.unit?.name ||
      (item as any)?.unit_name ||
      (item as any)?.unitName ||
      undefined;
    const parts = formatReceiptQtyParts(rawQty, unitLabel);
    const lineTotal =
      lineTotalRaw !== 0 ? Math.abs(lineTotalRaw) : unitPrice * rawQty;
    return {
      name: item.product?.name || "Unnamed Item",
      quantity: parts.quantity,
      price: unitPrice,
      unit: parts.unit,
      // Always send lineTotal so RATE stays correct if qty was converted (kg→g)
      lineTotal,
    };
  });

  const subtotalFromApi = num(sale.subtotal);
  const subtotal =
    subtotalFromApi > 0
      ? subtotalFromApi
      : items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const discount = num(sale.discount_amount);
  const taxAmount = num(sale.tax_amount);
  const total = Math.abs(num(sale.total_amount));
  const taxable = Math.max(0, subtotal - discount);
  const taxPercent = taxable > 0 && taxAmount > 0 ? (taxAmount / taxable) * 100 : undefined;

  const storeName = sale.branch?.name || branch.name || "Pehnawa Boutique";
  const storeAddress = sale.branch?.address || branch.address || "";
  const customerPhone =
    sale.customer?.phone_number ||
    sale.customer?.mobile_number ||
    sale.customer?.phone ||
    undefined;

  return {
    storeName,
    tagline: "Elegance, crafted for every moment.",
    address: storeAddress,
    transactionId: opts?.transactionLabel || sale.sale_number || sale.id || "",
    timestamp: sale.created_at || sale.sale_date || new Date().toISOString(),
    cashier:
      sale.user?.email?.split?.("@")?.[0] ||
      sale.user?.email ||
      "Cashier",
    salesperson: sale.salesperson?.name || undefined,
    customerType: sale.customer?.name || sale.customer?.email || "Walk-in",
    customerPhone: customerPhone || undefined,
    items,
    subtotal,
    discount: discount > 0 ? discount : undefined,
    taxPercent,
    total,
    paymentMethod: sale.payment_method || "CASH",
    amountPaid: total,
    changeAmount: 0,
    promo: sale.notes || undefined,
    thankYouMessage: "Thank you for shopping!",
    footerMessage: "Visit us again soon!",
  };
};

const mapReceiptLineItem = (
  item: NonNullable<ReceiptSourceSale["sale_items"]>[number],
  lineKind: "RETURN" | "EXCHANGE",
): ReceiptItem => {
  const qty = Math.abs(num(item.quantity) || 1);
  const unitPrice = Math.abs(num(item.unit_price));
  const lineTotal = Math.abs(num(item.line_total)) || unitPrice * qty;
  const unitLabel =
    (item.product as any)?.unit?.name ||
    (item.product as any)?.unit_name ||
    (item as any)?.unit?.name ||
    (item as any)?.unit_name ||
    (item as any)?.unitName ||
    undefined;
  const parts = formatReceiptQtyParts(qty, unitLabel);

  return {
    name: item.product?.name || "Unnamed Item",
    quantity: parts.quantity,
    price: unitPrice,
    unit: parts.unit,
    lineTotal,
    isCredit: lineKind === "RETURN",
  };
};

/** Build receipt data for return / refund / exchange transactions (not regular sales). */
export const prepareReturnReceiptDataFromSale = (
  sale: ReceiptSourceSale,
  branch: BranchInfoFallback,
  opts?: { transactionLabel?: string; originalSaleNumber?: string },
): ReceiptData => {
  const { meta, userNotes } = parseReturnNotes(sale.notes);
  const allItems = sale.sale_items || [];

  const transactionType: "RETURN" | "EXCHANGE" =
    meta.transactionType ||
    (sale.status === "EXCHANGED" ? "EXCHANGE" : "RETURN");

  const returnLines = allItems.filter(
    (item) =>
      item.item_type === "RETURN" || (item.item_type !== "EXCHANGE" && num(item.quantity) < 0),
  );
  const exchangeLines = allItems.filter((item) => item.item_type === "EXCHANGE");

  const itemSections: ReceiptSection[] = [];
  if (returnLines.length > 0) {
    itemSections.push({
      title: "RETURNED ITEMS",
      items: returnLines.map((item) => mapReceiptLineItem(item, "RETURN")),
    });
  }
  if (exchangeLines.length > 0) {
    itemSections.push({
      title: "NEW / REPLACEMENT ITEMS",
      items: exchangeLines.map((item) => mapReceiptLineItem(item, "EXCHANGE")),
    });
  }

  const returnValue =
    meta.returnValue ??
    returnLines.reduce((sum, item) => sum + Math.abs(num(item.line_total)), 0);
  const exchangeValue =
    meta.exchangeValue ??
    exchangeLines.reduce((sum, item) => sum + Math.abs(num(item.line_total)), 0);
  const balanceDue = meta.balanceDue ?? num(sale.total_amount);

  const summaryLines: ReceiptSummaryLine[] = [];

  const originalOrderAmount =
    sale.original_sale?.total_amount != null
      ? Math.abs(num(sale.original_sale.total_amount))
      : undefined;

  if (originalOrderAmount && originalOrderAmount > 0) {
    summaryLines.push({
      label: "Original order amount",
      value: money(originalOrderAmount),
    });
  }

  if (returnValue > 0) {
    summaryLines.push({
      label: "Returned items value",
      value: money(returnValue),
    });
  }

  if (transactionType === "EXCHANGE") {
    if (exchangeValue > 0) {
      summaryLines.push({
        label: "Replacement items value",
        value: money(exchangeValue),
      });
    }
    if (balanceDue > 0.005) {
      summaryLines.push({
        label: "Additional Amount to Collect",
        value: money(balanceDue),
        emphasis: true,
      });
    } else if (balanceDue < -0.005) {
      summaryLines.push({
        label: "Refund to Customer",
        value: money(Math.abs(balanceDue)),
        emphasis: true,
      });
    } else {
      summaryLines.push({ label: "Final balance", value: "No Difference", emphasis: true });
    }
  } else {
    summaryLines.push({
      label: "Refund to Customer",
      value: money(returnValue),
      emphasis: true,
    });
  }

  summaryLines.push({
    label: transactionType === "EXCHANGE" ? "Settlement" : "Refund method",
    value: formatSettlementLabel(meta, sale.payment_method),
  });

  if (meta.returnScope) {
    summaryLines.push({
      label: transactionType === "EXCHANGE" ? "Exchange type" : "Return type",
      value: meta.returnScope === "FULL" ? "Full order" : "Partial",
    });
  }

  const storeName = sale.branch?.name || branch.name || "Pehnawa Boutique";
  const storeAddress = sale.branch?.address || branch.address || "";
  const originalSaleNumber =
    opts?.originalSaleNumber ||
    sale.original_sale?.sale_number ||
    undefined;

  const flatItems = itemSections.flatMap((section) => section.items);

  return {
    storeName,
    tagline: "Elegance, crafted for every moment.",
    address: storeAddress,
    documentTitle:
      transactionType === "EXCHANGE" ? "EXCHANGE RECEIPT" : "RETURN / REFUND RECEIPT",
    transactionId: opts?.transactionLabel || sale.sale_number || sale.id || "",
    originalSaleNumber,
    timestamp: sale.created_at || sale.sale_date || new Date().toISOString(),
    cashier:
      sale.user?.email?.split?.("@")?.[0] ||
      sale.user?.email ||
      "Cashier",
    salesperson: sale.salesperson?.name || undefined,
    customerType: sale.customer?.name || sale.customer?.email || "Walk-in",
    customerPhone:
      sale.customer?.phone_number ||
      sale.customer?.mobile_number ||
      sale.customer?.phone ||
      undefined,
    items: flatItems,
    itemSections,
    summaryLines,
    subtotal: returnValue,
    total: Math.abs(balanceDue) || returnValue,
    paymentMethod: sale.payment_method || "CASH",
    amountPaid:
      transactionType === "EXCHANGE" && balanceDue > 0 ? balanceDue : undefined,
    changeAmount: 0,
    promo: userNotes || undefined,
    thankYouMessage:
      transactionType === "EXCHANGE"
        ? "Exchange completed. Thank you!"
        : "Return processed. Thank you!",
    footerMessage: "Visit us again soon!",
  };
};

const formatItemRate = (item: ReceiptItem): string => {
  const lineAmount =
    item.lineTotal != null
      ? Math.abs(item.lineTotal)
      : Math.abs(Number(item.price || 0) * Number(item.quantity || 0));
  return item.isCredit ? `- ${money(lineAmount)}` : money(lineAmount);
};

/** Thermal QTY column — expects quantity/unit already normalized via formatReceiptQtyParts. */
const formatReceiptQty = (quantity: number | null | undefined, unit?: string | null): string => {
  const n = Number(quantity);
  const qtyText = !Number.isFinite(n)
    ? "0"
    : Number.isInteger(n)
      ? String(n)
      : String(parseFloat(n.toFixed(3)));
  return unit ? `${qtyText} ${unit}` : qtyText;
};

const renderReceiptItemRowsHtml = (items: ReceiptItem[]): string =>
  items
    .map((item) => {
      const name = String(item.name || "");
      const qty = formatReceiptQty(item.quantity, item.unit);
      const rate = formatItemRate(item);
      return `<div class="item-row">
  <div class="item-name">${name}</div>
  <div class="item-qty">${qty}</div>
  <div class="item-rate">${rate}</div>
</div>`;
    })
    .join("");

const renderReceiptSectionsHtml = (data: ReceiptData): string => {
  if (data.itemSections && data.itemSections.length > 0) {
    return data.itemSections
      .map(
        (section) => `
<div class="section-title">${section.title}</div>
${renderReceiptItemRowsHtml(section.items)}`,
      )
      .join("");
  }
  return renderReceiptItemRowsHtml(data.items || []);
};

const renderReceiptSummaryHtml = (data: ReceiptData): string => {
  if (data.summaryLines && data.summaryLines.length > 0) {
    return data.summaryLines
      .map(
        (line) =>
          `<div class="row-lr${line.emphasis ? " total-row" : ""}"><span class="label">${line.label}</span><span class="value">${line.value}</span></div>`,
      )
      .join("");
  }

  const subtotal = Number(data.subtotal || 0);
  const discount = Number(data.discount || 0);
  const taxPercent = data.taxPercent || 0;
  const tax = taxPercent > 0 ? (subtotal - discount) * (taxPercent / 100) : 0;
  const total = data.total ?? Math.max(0, subtotal - discount + tax);
  const paid = data.amountPaid ?? total;
  const change = data.changeAmount ?? 0;

  return `
<div class="row-lr"><span class="label">Subtotal</span><span class="value">PKR ${money(subtotal)}</span></div>
${
  discount > 0
    ? `<div class="row-lr"><span class="label">Discount</span><span class="value">- PKR ${money(discount)}</span></div>`
    : ""
}
<div class="row-lr total-row"><span class="label">Grand Total</span><span class="value">PKR ${money(total)}</span></div>
<div class="divider"></div>
<div class="row-lr"><span class="label">Payment</span><span class="value">${(data.paymentMethod || "CASH").toUpperCase()}</span></div>
${
  paid !== undefined && paid !== null
    ? `<div class="row-lr"><span class="label">Paid</span><span class="value">PKR ${money(paid)}</span></div>`
    : ""
}
${
  change > 0
    ? `<div class="row-lr"><span class="label">Change</span><span class="value">PKR ${money(change)}</span></div>`
    : ""
}`;
};

export const generateReceiptHtml = (data: ReceiptData, logoDataUri = ""): string => {
  const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();
  const itemsHtml = renderReceiptSectionsHtml(data);
  const summaryHtml = renderReceiptSummaryHtml(data);
  const promoHtml = data.promo ? `<div class="promo">Notes: ${data.promo}</div>` : "";
  const branchLine = buildReceiptBranchLine(data.storeName, data.address);
  const docTitleHtml = data.documentTitle
    ? `<div class="doc-title">${data.documentTitle}</div>`
    : "";
  const storeAddress =
    (data.address && data.address.trim()) || PEHNAWA_DEFAULT_STORE_ADDRESS;
  const footerLines = [
    "Call / WhatsApp: 03013181111",
    "Website: pehnawastore.pk",
    storeAddress,
  ];
  const footerHtml = footerLines.map((line) => `<div class="footer-line">${line}</div>`).join("");
  const aceHtml = `
<div class="divider-thin"></div>
<div class="powered-by">Powered by Ace Studios</div>
<div class="ace-line">Website: acestudiosus.com</div>
<div class="ace-line">Contact: ${ACE_STUDIOS_CONTACT}</div>`;
  const logoSrc = logoDataUri || (typeof window !== "undefined" ? `${window.location.origin}/logo.png` : "/logo.png");

  return `
<div class="receipt">
<div class="logo">
<img src="${logoSrc}" alt="Logo" class="logo-img" />
</div>
<div class="store-name">${branchLine}</div>
<div class="tagline">${data.tagline || "Elegance, crafted for every moment."}</div>
${docTitleHtml}
${data.strn ? `<div class="strn">${data.strn}</div>` : ""}

<div class="divider"></div>

<div class="row-lr"><span class="label">Receipt #</span><span class="value">${data.transactionId}</span></div>
${
  data.originalSaleNumber
    ? `<div class="row-lr"><span class="label">Original sale</span><span class="value">${data.originalSaleNumber}</span></div>`
    : ""
}
<div class="row-lr"><span class="label">Date</span><span class="value">${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString()}</span></div>
<div class="row-lr"><span class="label">Cashier</span><span class="value">${data.cashier || "Cashier"}</span></div>
${data.salesperson ? `<div class="row-lr"><span class="label">Salesperson</span><span class="value">${data.salesperson}</span></div>` : ""}
<div class="row-lr"><span class="label">Customer</span><span class="value">${data.customerType || "Walk-in"}</span></div>
${data.customerPhone ? `<div class="row-lr"><span class="label">Phone</span><span class="value">${data.customerPhone}</span></div>` : ""}

<div class="divider"></div>

<div class="items-header">
  <div class="item-col">ITEM</div>
  <div class="qty-col">QTY</div>
  <div class="rate-col">AMOUNT</div>
</div>
<div class="items-divider"></div>

<div class="items-list">
${itemsHtml}
</div>

<div class="divider"></div>

${summaryHtml}

${promoHtml}

<div class="divider"></div>

<div class="barcode-section">
  <svg id="barcode-svg"></svg>
  <div class="barcode-number" id="barcode-number">${data.transactionId}</div>
</div>

<div class="thank-you">${data.thankYouMessage || "Thank you for shopping!"}</div>
${footerHtml}
${aceHtml}
</div>
`;
};

export const receiptPageWrapper = (content: string): string => `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Receipt</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js"></script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: white;
  height: 100%; min-height: 100%;
  overflow-x: hidden; overflow-y: auto;
  font-family: 'Helvetica', 'Arial', sans-serif;
  width: 100%; max-width: 100%;
}
body { display: block; width: 100%; box-sizing: border-box; padding: 0; }
.receipt {
  width: 100%; max-width: 100%;
  background: #ffffff; color: #000000;
  padding: 20px 16px 24px 16px;
  margin: 0; overflow: hidden;
  word-wrap: break-word; overflow-wrap: break-word;
  font-weight: bold; box-sizing: border-box; display: block;
}
.logo { text-align: center; margin-bottom: 5mm; }
.logo-img {
  max-width: 58mm; max-height: 16mm;
  width: auto; height: auto;
  display: block; margin: 0 auto;
  object-fit: contain;
}
.store-name {
  font-weight: bold; font-size: 11pt; text-align: center;
  margin-top: 1mm; margin-bottom: 2mm; color: #000000; line-height: 1.25;
  padding: 0 2mm; word-wrap: break-word; overflow-wrap: anywhere;
  white-space: normal; max-width: 100%;
}
.tagline {
  font-size: 9.4pt; text-align: center;
  margin-bottom: 2mm; color: #000000; font-weight: bold; line-height: 1.2;
}
.divider { border-top: 1px dotted #000; margin: 3mm 0; height: 0; width: 100%; }
.divider-thin { border-top: 0.5px dotted #000; margin: 3mm 0; height: 0; width: 100%; }
.row-lr {
  display: flex; justify-content: space-between; align-items: center;
  width: 100%; margin: 2mm 0;
  font-size: 9.4pt; line-height: 1.3; word-break: break-word;
}
.row-lr .label { flex: 0 0 45%; text-align: left; font-weight: bold; color: #000000; }
.row-lr .value { flex: 1; text-align: right; font-weight: bold; color: #000000; word-break: break-all; }
.total-row { font-size: 11.2pt; margin-top: 2mm; font-weight: bold; }
.items-header {
  display: flex; justify-content: space-between; align-items: center;
  width: 100%; font-weight: bold; font-size: 11.2pt;
  margin-bottom: 1mm; color: #000000;
}
.items-divider { border-top: 1px solid #000; margin: 2mm 0 0 0; height: 0; width: 100%; }
.items-list { padding-top: 5mm; }
.items-list .item-row:first-child { margin-top: 0; }
.item-col { flex: 0 0 56%; text-align: left; padding-right: 2mm; }
.qty-col { flex: 0 0 14%; text-align: right; padding-right: 2mm; }
.rate-col { flex: 1; text-align: right; }
.item-row {
  display: flex; justify-content: space-between; align-items: flex-start;
  width: 100%; margin: 2mm 0;
  font-size: 9.4pt; line-height: 1.3; word-break: break-word;
}
.item-name { flex: 0 0 56%; text-align: left; padding-right: 2mm; word-break: break-word; }
.item-qty { flex: 0 0 14%; text-align: right; padding-right: 2mm; word-break: break-word; }
.item-rate { flex: 1; text-align: right; word-break: break-all; }
.barcode-section { text-align: center; margin: 4mm 0; }
.barcode-section svg { max-width: 48mm; height: 14mm; display: block; margin: 0 auto; }
.barcode-number {
  font-size: 9.8pt; margin-top: 2mm; font-weight: bold;
  letter-spacing: 1px; color: #000000; text-align: center;
}
.thank-you {
  font-size: 10.6pt; margin-top: 4mm; margin-bottom: 2mm;
  font-weight: bold; text-align: center; color: #000000; line-height: 1.2;
}
.footer-line {
  font-size: 9.8pt; margin: 1mm 0; font-weight: bold;
  text-align: center; color: #000000; line-height: 1.25;
  padding: 0 2mm; word-wrap: break-word; overflow-wrap: anywhere;
  white-space: normal;
}
.promo {
  font-size: 9.4pt; text-align: center; margin: 2mm 0;
  color: #000000; font-weight: bold; line-height: 1.3; word-break: break-word;
}
.doc-title {
  font-size: 11pt; text-align: center; margin: 2mm 0 1mm 0;
  font-weight: bold; letter-spacing: 0.5px;
}
.section-title {
  font-size: 9.8pt; font-weight: bold; margin: 3mm 0 1.5mm 0;
  text-transform: uppercase; letter-spacing: 0.3px;
}
.powered-by {
  font-size: 8.5pt; text-align: center; margin: 3mm 0 1mm 0;
  color: #000000; font-weight: bold; line-height: 1.2;
}
.ace-line {
  font-size: 8pt; text-align: center; margin: 1mm 0;
  color: #000000; font-weight: bold; line-height: 1.2;
}
</style>
</head>
<body>
${content}
<script>
window.onload = function() {
  const barcodeElement = document.getElementById('barcode-svg');
  const barcodeNumber = document.getElementById('barcode-number')?.textContent || '';
  if (barcodeElement && barcodeNumber && window.JsBarcode) {
    try {
      JsBarcode(barcodeElement, barcodeNumber, {
        format: "CODE128",
        width: 2, height: 50,
        displayValue: false, margin: 0,
        background: "#ffffff", lineColor: "#000000"
      });
    } catch (err) { console.error('Barcode generation failed:', err); }
  }
};
</script>
</body>
</html>
`;

// Build a thermal-receipt-sized PDF (80mm wide) from receiptData using jsPDF.
// Returns null if jsPDF can't load.
export const buildReceiptPdfBlob = async (
  receiptData: ReceiptData,
  logoDataUri = "",
): Promise<{ blob: Blob; filename: string } | null> => {
  if (!receiptData) return null;
  const { jsPDF } = await import("jspdf");

  const widthMm = 80;
  const doc = new jsPDF({ unit: "mm", format: [widthMm, 297] });
  const left = 4;
  const right = widthMm - 4;
  const usable = right - left;
  let y = 6;
  const lineGap = 4;
  const sectionGap = 2;

  const writeCentered = (text: string, opts?: { bold?: boolean; size?: number }) => {
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(opts?.size ?? 9);
    const lines = doc.splitTextToSize(text, usable);
    lines.forEach((ln: string) => {
      doc.text(ln, widthMm / 2, y, { align: "center" });
      y += lineGap;
    });
  };
  const writeRow = (label: string, value: string, opts?: { bold?: boolean; size?: number }) => {
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(opts?.size ?? 8.5);
    doc.text(label, left, y);
    doc.text(value, right, y, { align: "right" });
    y += lineGap;
  };
  const hr = () => {
    doc.setLineDashPattern([0.6, 0.6], 0);
    doc.setLineWidth(0.2);
    doc.line(left, y, right, y);
    doc.setLineDashPattern([], 0);
    y += sectionGap + 2;
  };

  if (logoDataUri) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = logoDataUri;
      });
      const aspect = img.naturalWidth / img.naturalHeight || 2;
      const maxW = 44;
      const maxH = 20;
      let imgW = maxW;
      let imgH = imgW / aspect;
      if (imgH > maxH) {
        imgH = maxH;
        imgW = imgH * aspect;
      }
      const x = (widthMm - imgW) / 2;
      doc.addImage(logoDataUri, "PNG", x, y, imgW, imgH);
      y += imgH + 5;
    } catch {
      // ignore — image load failed; continue without logo
    }
  }

  if (receiptData.storeName) writeCentered(receiptData.storeName, { bold: true, size: 11 });
  const pdfAddress =
    (receiptData.address && receiptData.address.trim()) || PEHNAWA_DEFAULT_STORE_ADDRESS;
  if (pdfAddress) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const addrLines: string[] = doc.splitTextToSize(pdfAddress, usable);
    for (const line of addrLines) {
      writeCentered(line, { size: 8.5 });
    }
  }
  writeCentered(receiptData.tagline || "Elegance, crafted for every moment.", { size: 8 });
  if (receiptData.documentTitle) {
    writeCentered(receiptData.documentTitle, { bold: true, size: 10 });
  }
  hr();

  const when = receiptData.timestamp ? new Date(receiptData.timestamp) : new Date();
  writeRow("Receipt #", String(receiptData.transactionId));
  if (receiptData.originalSaleNumber) {
    writeRow("Original sale", String(receiptData.originalSaleNumber));
  }
  writeRow("Date", `${when.toLocaleDateString()} ${when.toLocaleTimeString()}`);
  writeRow("Cashier", receiptData.cashier || "Cashier");
  if (receiptData.salesperson) writeRow("Salesperson", receiptData.salesperson);
  writeRow("Customer", receiptData.customerType || "Walk-in");
  if (receiptData.customerPhone) writeRow("Phone", receiptData.customerPhone);
  hr();

  const colItemMaxWidth = usable * 0.6;
  const qtyAnchor = left + usable * 0.74;
  const rateAnchor = right;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("ITEM", left, y);
  doc.text("QTY", qtyAnchor, y, { align: "right" });
  doc.text("AMOUNT", rateAnchor, y, { align: "right" });
  y += 2;
  doc.setLineWidth(0.3);
  doc.line(left, y, right, y);
  y += 5;

  const writeItemRows = (items: ReceiptItem[]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const rowGap = 4.5;
    for (const it of items) {
      const name = String(it.name || "");
      const qty = formatReceiptQty(it.quantity, it.unit);
      const rate = formatItemRate(it);
      const nameLines: string[] = doc.splitTextToSize(name, colItemMaxWidth);
      doc.text(nameLines, left, y);
      doc.text(qty, qtyAnchor, y, { align: "right" });
      doc.text(rate, rateAnchor, y, { align: "right" });
      y += rowGap * Math.max(1, nameLines.length);
    }
  };

  if (receiptData.itemSections && receiptData.itemSections.length > 0) {
    for (const section of receiptData.itemSections) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(section.title, left, y);
      y += lineGap;
      writeItemRows(section.items);
      y += 1;
    }
  } else {
    writeItemRows(receiptData.items || []);
  }

  y += 1;
  hr();

  if (receiptData.summaryLines && receiptData.summaryLines.length > 0) {
    for (const line of receiptData.summaryLines) {
      writeRow(line.label, line.value, line.emphasis ? { bold: true, size: 10 } : undefined);
    }
  } else {
    writeRow("Subtotal", `PKR ${money(receiptData.subtotal || 0)}`);
    if (receiptData.discount && Number(receiptData.discount) > 0) {
      writeRow("Discount", `- PKR ${money(receiptData.discount)}`);
    }
    writeRow("Grand Total", `PKR ${money(receiptData.total ?? 0)}`, { bold: true, size: 10 });
    hr();
    writeRow("Payment", String(receiptData.paymentMethod || "CASH").toUpperCase());
    if (receiptData.amountPaid != null) {
      writeRow("Paid", `PKR ${money(receiptData.amountPaid)}`);
    }
    if (receiptData.changeAmount && receiptData.changeAmount > 0) {
      writeRow("Change", `PKR ${money(receiptData.changeAmount)}`);
    }
  }
  hr();

  if (receiptData.promo) {
    writeCentered(`Notes: ${receiptData.promo}`, { size: 8 });
    hr();
  }

  writeCentered(receiptData.thankYouMessage || "Thank you for shopping!", { bold: true, size: 9.5 });
  writeCentered("Call / WhatsApp: 03013181111", { size: 8 });
  writeCentered("Website: pehnawastore.pk", { size: 8 });
  const footerAddrLines: string[] = doc.splitTextToSize(pdfAddress, usable);
  for (const line of footerAddrLines) {
    writeCentered(line, { size: 8 });
  }
  writeCentered("Powered by Ace Studios", { size: 8 });
  writeCentered("Website: acestudiosus.com", { size: 8 });
  writeCentered(`Contact: ${ACE_STUDIOS_CONTACT}`, { size: 8 });

  const blob = doc.output("blob");
  const filename = `receipt-${receiptData.transactionId || "sale"}.pdf`;
  return { blob, filename };
};

// Normalize a phone number for wa.me (digits only, +92 for local 03... numbers).
export const normalizeWhatsAppNumber = (raw?: string | null): string => {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  return digits;
};

// Open a wa.me URL with the receipt PDF attached when supported (Web Share API),
// otherwise download the PDF + open wa.me with a "please attach the file" note.
export const shareReceiptOnWhatsApp = async (
  receiptData: ReceiptData,
  logoDataUri: string,
  phone?: string | null,
): Promise<{ shared: boolean; fellBack: boolean }> => {
  const pdf = await buildReceiptPdfBlob(receiptData, logoDataUri);
  if (!pdf) throw new Error("Failed to generate receipt PDF");

  const file = new File([pdf.blob], pdf.filename, { type: "application/pdf" });
  const navAny = navigator as any;
  if (navAny.canShare && navAny.canShare({ files: [file] }) && navAny.share) {
    try {
      await navAny.share({
        files: [file],
        title: `Receipt ${receiptData.transactionId}`,
        text: `Receipt ${receiptData.transactionId} — ${receiptData.storeName || ""}`.trim(),
      });
      return { shared: true, fellBack: false };
    } catch (err: any) {
      if (err?.name === "AbortError") return { shared: false, fellBack: false };
      // fall through to download
    }
  }

  const url = URL.createObjectURL(pdf.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = pdf.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const normalized = normalizeWhatsAppNumber(phone || "");
  const note = `Receipt ${receiptData.transactionId} downloaded as ${pdf.filename}. Please attach the file in this chat.`;
  const waUrl = `https://wa.me/${normalized}?text=${encodeURIComponent(note)}`;
  window.open(waUrl, "_blank", "noopener,noreferrer");

  return { shared: true, fellBack: true };
};

// Convenience: download a receipt PDF directly.
export const downloadReceiptPdf = async (
  receiptData: ReceiptData,
  logoDataUri: string,
): Promise<void> => {
  let logo = logoDataUri;
  if (!logo) {
    try {
      const res = await fetch("/logo.png");
      if (res.ok) {
        const blob = await res.blob();
        logo = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () =>
            typeof reader.result === "string" ? resolve(reader.result) : reject();
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    } catch {
      // continue without logo
    }
  }
  const pdf = await buildReceiptPdfBlob(receiptData, logo);
  if (!pdf) throw new Error("Failed to generate receipt PDF");
  const url = URL.createObjectURL(pdf.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = pdf.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
