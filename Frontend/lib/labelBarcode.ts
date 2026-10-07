import { BARCODE_LABEL_BRAND_PREFIX } from "@/config/constants";

/** Must match backend `numericBarcodeSku.ts` for label / scan consistency. */

/** Product title line on printed labels — brand prefix + product name. */
export function formatBarcodeLabelTitle(productName: string): string {
  const name = (productName || "").trim();
  if (!name) return BARCODE_LABEL_BRAND_PREFIX;
  const upper = name.toUpperCase();
  const brand = BARCODE_LABEL_BRAND_PREFIX.toUpperCase();
  if (upper.startsWith(`${brand} `)) return upper;
  if (upper.startsWith("PEHNAVA ")) return `${brand} ${upper.slice(8)}`;
  return `${brand} ${upper}`;
}

const NUMERIC_SKU_REGEX = /^\d{9}$/;

export type LabelBarcodeMode = "auto" | "manual";

/** Code128-safe auto barcode from product code (keeps hyphens, e.g. AR-SS-SA). */
export function sanitizeCodeForLabelBarcode(raw: string | undefined | null): string {
  const cleaned = String(raw || "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned) return "PROD";
  return cleaned.replace(/[a-z]/g, (ch) => ch.toUpperCase());
}

/** Scannable payload only — price is printed separately on the label, not in the bars. */
export function encodeLabelBarcodeValue(
  sku: string | undefined | null,
  code: string | undefined | null,
  _calculatedPriceInt: number
): string {
  const s = (sku || "").trim();
  if (NUMERIC_SKU_REGEX.test(s)) {
    return s;
  }
  const raw = (code || sku || "PROD").toString();
  return sanitizeCodeForLabelBarcode(raw);
}

/** Strip characters thermal EPL/Code128 cannot print reliably. */
export function sanitizeManualBarcodeValue(raw: string): string {
  return String(raw || "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export function resolveLabelBarcodeValue(options: {
  mode: LabelBarcodeMode;
  manualValue?: string | null;
  sku?: string | null;
  code?: string | null;
  calculatedPriceInt: number;
}): string {
  const manual = sanitizeManualBarcodeValue(options.manualValue || "");
  if (options.mode === "manual" && manual) {
    return manual;
  }
  return encodeLabelBarcodeValue(
    options.sku,
    options.code,
    options.calculatedPriceInt,
  );
}

export function previewAutoBarcodeValue(
  sku: string | undefined | null,
  code: string | undefined | null,
  calculatedPriceInt: number,
): string {
  return encodeLabelBarcodeValue(sku, code, calculatedPriceInt);
}

const stripAlphanumeric = (v: string) =>
  v.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** Older prints saved barcodes with hyphens removed (e.g. ARSSSA vs AR-SS-SA). */
export function isLegacyStrippedLabelBarcode(
  saved: string,
  sku?: string | null,
  code?: string | null,
): boolean {
  const trimmed = (saved || "").trim();
  if (!trimmed) return false;
  const auto = encodeLabelBarcodeValue(sku, code, 0);
  if (!auto) return false;
  return (
    stripAlphanumeric(trimmed) === stripAlphanumeric(auto) &&
    trimmed.toUpperCase() !== auto.toUpperCase()
  );
}

/** Prefill Custom mode — saved label, legacy custom_code, or POS/auto barcode. */
export function initialManualBarcodeForProduct(options: {
  label_barcode?: string | null;
  custom_code?: string | null;
  sku?: string | null;
  code?: string | null;
  sales_rate_exc_dis_and_tax?: number;
}): string {
  const saved = (options.label_barcode || options.custom_code || "").trim();
  if (saved) {
    if (isLegacyStrippedLabelBarcode(saved, options.sku, options.code)) {
      return encodeLabelBarcodeValue(options.sku, options.code, 0);
    }
    return saved;
  }
  return getProductBarcodeDisplay(options);
}

/** Saved label barcode, else SKU, else auto code — same as POS / label print. */
export function getProductBarcodeDisplay(product: {
  label_barcode?: string | null;
  custom_code?: string | null;
  sku?: string | null;
  code?: string | null;
  sales_rate_exc_dis_and_tax?: number;
}): string {
  const label = (product.label_barcode || product.custom_code || "").trim();
  if (label) return label;
  const sku = (product.sku || "").trim();
  if (sku) return sku;
  const price = Math.round(Number(product.sales_rate_exc_dis_and_tax ?? 0));
  return encodeLabelBarcodeValue(product.sku, product.code, price);
}
