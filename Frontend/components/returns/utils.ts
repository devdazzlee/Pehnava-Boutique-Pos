export const normalizeSaleSearchTerm = (value?: string) =>
  (value || "").replace(/\s+/g, " ").trim();

export const formatMoney = (n: number) =>
  `Rs ${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

/** Ratio of what the customer paid to the pre-discount line subtotal (order discount proration). */
export function computeOriginalSalePaidFactor(sale: {
  subtotal?: number
  discount_amount?: number
  total_amount?: number
  sale_items?: Array<{ line_total?: number }>
}): number {
  const lineSum = (sale.sale_items || []).reduce(
    (s, i) => s + (Number(i.line_total) || 0),
    0,
  )
  const grossSubtotal = (Number(sale.subtotal) > 0 ? Number(sale.subtotal) : 0) || lineSum
  if (grossSubtotal <= 0) return 1

  const orderDiscount = Number(sale.discount_amount) || 0
  if (orderDiscount > 0) {
    return Math.max(0, Math.min(1, (grossSubtotal - orderDiscount) / grossSubtotal))
  }

  const paid = Math.abs(Number(sale.total_amount) || 0)
  if (paid > 0 && paid < grossSubtotal - 0.01) {
    return Math.max(0, Math.min(1, paid / grossSubtotal))
  }
  return 1
}

export interface ReturnMeta {
  transactionType?: "RETURN" | "EXCHANGE";
  returnScope?: "FULL" | "PARTIAL";
  returnReason?: string;
  refundMethod?: string;
  exchangeBalanceAction?: string;
  status?: string;
  returnValue?: number;
  exchangeValue?: number;
  balanceDue?: number;
  itemDispositions?: Record<string, string>;
}

const META_RE = /^__META__(.+?)__ENDMETA__\n?/s;

export function parseReturnNotes(notes?: string | null): {
  meta: ReturnMeta;
  userNotes: string;
} {
  if (!notes) return { meta: {}, userNotes: "" };
  const match = notes.match(META_RE);
  if (!match) return { meta: {}, userNotes: notes };
  try {
    return { meta: JSON.parse(match[1]) as ReturnMeta, userNotes: notes.slice(match[0].length) };
  } catch {
    return { meta: {}, userNotes: notes };
  }
}

export function getIneligibleSaleReason(status?: string) {
  switch (status) {
    case "REFUNDED":
      return "This sale is fully refunded.";
    case "EXCHANGED":
      return "This sale is fully exchanged.";
    case "CANCELLED":
      return "Cancelled sales cannot be returned.";
    case "PENDING":
      return "This sale is not completed yet.";
    default:
      return "This sale is not eligible.";
  }
}

/** User-facing label for return/exchange transaction status in history tables. */
export function getReturnStatusLabel(status: string): string {
  switch (status) {
    case "REFUNDED":
      return "Return"
    case "EXCHANGED":
      return "Exchange"
    case "PENDING":
      return "Pending"
    case "CANCELLED":
      return "Cancelled"
    case "COMPLETED":
      return "Completed"
    default:
      return status
  }
}

const RETURN_QTY_INPUT_PATTERN = /^(\d*\.?\d*)$/

export function isReturnQuantityDraft(value: string): boolean {
  return value === "" || RETURN_QTY_INPUT_PATTERN.test(value)
}

export function isIncompleteReturnQuantityDraft(value: string): boolean {
  const trimmed = value.trim()
  return trimmed === "" || trimmed === "." || trimmed.endsWith(".")
}

export type ReturnQuantityValidation =
  | { ok: true; quantity: number }
  | { ok: false; message: string }

export const RETURN_QTY_INVALID_TOAST_TITLE = "Invalid Return Quantity"

export function getReturnQuantityExceededMessage(
  enteredQuantity: number,
  remainingQuantity: number,
  productName: string,
): string {
  return `Return quantity (${enteredQuantity}) cannot exceed what is still returnable (${remainingQuantity}) for ${productName}.`
}

export function validateReturnQuantity(
  quantity: number,
  remainingQuantity: number,
  productName: string,
): ReturnQuantityValidation {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      ok: false,
      message: `Enter a valid return quantity for ${productName}.`,
    }
  }

  if (quantity > remainingQuantity) {
    return {
      ok: false,
      message: getReturnQuantityExceededMessage(quantity, remainingQuantity, productName),
    }
  }

  return { ok: true, quantity }
}

/** Parse a committed quantity string. Returns null for empty or in-progress decimals. */
export function parseReturnQuantityInput(rawValue: string): number | null {
  const value = rawValue.trim()
  if (isIncompleteReturnQuantityDraft(value)) {
    return null
  }

  const numValue = parseFloat(value)
  return Number.isFinite(numValue) ? numValue : null
}

export function exceedsReturnableQuantity(
  rawValue: string,
  remainingQuantity: number,
): boolean {
  const parsed = parseReturnQuantityInput(rawValue)
  return parsed !== null && parsed > remainingQuantity
}

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value
  if (typeof value === "string") return parseFloat(value) || 0
  return 0
}

export interface ReturnTransactionLineItem {
  productName: string
  sku: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface ReturnTransactionSummary {
  transactionType: "RETURN" | "EXCHANGE"
  returnScope?: "FULL" | "PARTIAL"
  returnReason?: string
  settlementLabel: string
  originalOrderAmount?: number
  returnedItems: ReturnTransactionLineItem[]
  replacementItems: ReturnTransactionLineItem[]
  returnValue: number
  exchangeValue: number
  /** Positive = customer pays extra; negative = refund/credit to customer */
  balanceDue: number
  userNotes?: string
  refundMethod?: string
  exchangeBalanceAction?: string
}

export type FinalBalanceType = "refund" | "collect" | "none"

export interface PaymentSettlementDetails {
  originalOrderAmount: number
  returnedItemsValue: number
  /** Returned-items value BEFORE the original order discount was prorated out. */
  returnedItemsGrossValue: number
  /** Portion of the original order discount that applies to the returned items. */
  orderDiscountApplied: number
  replacementItemsValue: number
  /** New items subtotal before whole-exchange discount (after line discounts). */
  replacementItemsGrossValue?: number
  /** Order-level discount on replacement items in an exchange. */
  exchangeOrderDiscountApplied?: number
  returnScope: "FULL" | "PARTIAL"
  transactionType: "RETURN" | "EXCHANGE"
  balanceDue: number
  finalBalanceType: FinalBalanceType
  finalBalanceLabel: string
  finalBalanceAmount: number
  returnTypeLabel: string
}

export function computePaymentSettlement(params: {
  transactionType: "RETURN" | "EXCHANGE"
  returnScope: "FULL" | "PARTIAL"
  originalOrderAmount: number
  returnedItemsValue: number
  replacementItemsValue: number
  /** Pre-discount value of the returned items; defaults to `returnedItemsValue`. */
  returnedItemsGrossValue?: number
  /** Replacement subtotal before whole-exchange discount; defaults to `replacementItemsValue`. */
  replacementItemsGrossValue?: number
}): PaymentSettlementDetails {
  const {
    transactionType,
    returnScope,
    originalOrderAmount,
    returnedItemsValue,
    replacementItemsValue,
  } = params
  const returnedItemsGrossValue =
    params.returnedItemsGrossValue != null && params.returnedItemsGrossValue > returnedItemsValue
      ? params.returnedItemsGrossValue
      : returnedItemsValue
  const orderDiscountApplied = Math.max(0, returnedItemsGrossValue - returnedItemsValue)
  const replacementGross =
    params.replacementItemsGrossValue != null &&
    params.replacementItemsGrossValue > replacementItemsValue
      ? params.replacementItemsGrossValue
      : replacementItemsValue
  const exchangeOrderDiscountApplied = Math.max(0, replacementGross - replacementItemsValue)

  const returnTypeLabel =
    transactionType === "EXCHANGE"
      ? returnScope === "FULL"
        ? "Full exchange"
        : "Partial exchange"
      : returnScope === "FULL"
        ? "Full return"
        : "Partial return"

  if (transactionType === "RETURN") {
    const refundAmount = returnedItemsValue
    return {
      originalOrderAmount,
      returnedItemsValue,
      returnedItemsGrossValue,
      orderDiscountApplied,
      replacementItemsValue: 0,
      replacementItemsGrossValue: 0,
      exchangeOrderDiscountApplied: 0,
      returnScope,
      transactionType,
      balanceDue: -refundAmount,
      finalBalanceType: refundAmount > 0.005 ? "refund" : "none",
      finalBalanceLabel: refundAmount > 0.005 ? "Refund to Customer" : "No Difference",
      finalBalanceAmount: refundAmount,
      returnTypeLabel,
    }
  }

  const balanceDue = replacementItemsValue - returnedItemsValue
  let finalBalanceType: FinalBalanceType = "none"
  let finalBalanceLabel = "No Difference"
  let finalBalanceAmount = 0

  if (balanceDue > 0.005) {
    finalBalanceType = "collect"
    finalBalanceLabel = "Additional Amount to Collect"
    finalBalanceAmount = balanceDue
  } else if (balanceDue < -0.005) {
    finalBalanceType = "refund"
    finalBalanceLabel = "Refund to Customer"
    finalBalanceAmount = Math.abs(balanceDue)
  }

  return {
    originalOrderAmount,
    returnedItemsValue,
    returnedItemsGrossValue,
    orderDiscountApplied,
    replacementItemsValue,
    replacementItemsGrossValue: replacementGross,
    exchangeOrderDiscountApplied,
    returnScope,
    transactionType,
    balanceDue,
    finalBalanceType,
    finalBalanceLabel,
    finalBalanceAmount,
    returnTypeLabel,
  }
}

export function paymentSettlementFromTransactionSummary(
  summary: ReturnTransactionSummary,
): PaymentSettlementDetails {
  return computePaymentSettlement({
    transactionType: summary.transactionType,
    returnScope: summary.returnScope || "PARTIAL",
    originalOrderAmount: summary.originalOrderAmount ?? summary.returnValue,
    returnedItemsValue: summary.returnValue,
    replacementItemsValue: summary.exchangeValue,
  })
}

export function formatSettlementLabel(
  meta: ReturnMeta,
  paymentMethod?: string | null,
): string {
  if (meta.transactionType === "EXCHANGE") {
    switch (meta.exchangeBalanceAction) {
      case "collect":
        return "Cash / card collected from customer"
      case "refund":
        return "Refund difference to customer"
      case "store_credit":
        return "Store credit issued to customer"
      default:
        break
    }
  }
  switch (meta.refundMethod) {
    case "original_payment":
      return "Refunded via original payment method"
    case "cash":
      return "Cash refund to customer"
    case "card":
      return "Card refund to customer"
    case "bank_transfer":
      return "Bank transfer refund"
    case "store_credit":
      return "Store credit issued"
    case "no_refund":
      return "No refund issued"
    default:
      return String(paymentMethod || "CASH").replace(/_/g, " ")
  }
}

export function buildReturnTransactionSummary(source: {
  status: string
  payment_method?: string
  total_amount?: number
  notes?: string | null
  original_sale_total?: number | null
  sale_items?: Array<{
    product?: { name?: string; sku?: string }
    quantity?: number
    unit_price?: number
    line_total?: number
    item_type?: string
  }>
}): ReturnTransactionSummary {
  const { meta, userNotes } = parseReturnNotes(source.notes)
  const allItems = source.sale_items || []

  const transactionType: "RETURN" | "EXCHANGE" =
    meta.transactionType ||
    (source.status === "EXCHANGED" ? "EXCHANGE" : "RETURN")

  const mapLine = (item: (typeof allItems)[number]): ReturnTransactionLineItem => ({
    productName: item.product?.name || "Unnamed Product",
    sku: item.product?.sku || "—",
    quantity: Math.abs(toNumber(item.quantity) || 1),
    unitPrice: Math.abs(toNumber(item.unit_price)),
    lineTotal: Math.abs(toNumber(item.line_total)),
  })

  const returnedItems = allItems
    .filter(
      (item) =>
        item.item_type === "RETURN" ||
        (item.item_type !== "EXCHANGE" && toNumber(item.quantity) < 0),
    )
    .map(mapLine)

  const replacementItems = allItems
    .filter((item) => item.item_type === "EXCHANGE")
    .map(mapLine)

  const returnValue =
    meta.returnValue ??
    returnedItems.reduce((sum, item) => sum + item.lineTotal, 0)
  const exchangeValue =
    meta.exchangeValue ??
    replacementItems.reduce((sum, item) => sum + item.lineTotal, 0)
  const balanceDue = meta.balanceDue ?? toNumber(source.total_amount)

  const originalOrderAmount =
    source.original_sale_total != null
      ? Math.abs(toNumber(source.original_sale_total))
      : undefined

  return {
    transactionType,
    returnScope: meta.returnScope,
    returnReason: meta.returnReason,
    settlementLabel: formatSettlementLabel(meta, source.payment_method),
    originalOrderAmount,
    returnedItems,
    replacementItems,
    returnValue,
    exchangeValue,
    balanceDue,
    userNotes: userNotes || undefined,
    refundMethod: meta.refundMethod,
    exchangeBalanceAction: meta.exchangeBalanceAction,
  }
}

export function getReturnReasonLabel(reason?: string): string {
  if (!reason) return ""
  return reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}
