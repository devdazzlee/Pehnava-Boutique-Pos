/** Must match backend `numericBarcodeSku.ts` for label / scan consistency. */

const NUMERIC_SKU_REGEX = /^\d{9}$/;

export type LabelBarcodeMode = "auto" | "manual";

export function encodeLabelBarcodeValue(
  sku: string | undefined | null,
  code: string | undefined | null,
  calculatedPriceInt: number
): string {
  const s = (sku || "").trim();
  if (NUMERIC_SKU_REGEX.test(s)) {
    return s;
  }
  const raw = (sku || code || "PROD").toString();
  const sanitized = raw.replace(/[^A-Za-z0-9]/g, "") || "PROD";
  return `${sanitized}-${Math.round(calculatedPriceInt)}`;
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
