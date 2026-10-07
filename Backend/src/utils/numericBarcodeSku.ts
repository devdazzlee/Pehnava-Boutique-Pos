import type { Prisma } from '@prisma/client';

/** Product `sku` doubles as scannable barcode: exactly 9 digits, globally unique. */
export const NUMERIC_SKU_REGEX = /^\d{9}$/;

const MIN = 100_000_000;
const MAX = 999_999_999;

type ProductDb = Pick<Prisma.TransactionClient, 'product'>;

export function isNineDigitNumericSku(value: string | undefined | null): boolean {
  if (value === undefined || value === null) return false;
  return NUMERIC_SKU_REGEX.test(String(value).trim());
}

/** Code128-safe auto barcode from product code (keeps hyphens, e.g. AR-SS-SA). */
export function sanitizeCodeForLabelBarcode(raw: string | undefined | null): string {
  const cleaned = String(raw || '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (!cleaned) return 'PROD';
  return cleaned.replace(/[a-z]/g, (ch) => ch.toUpperCase());
}

/**
 * Scannable payload only — price is shown on the label text, not encoded in the bars.
 * 9-digit numeric SKU when available; otherwise sanitized product code.
 */
export function encodeLabelBarcodeValue(
  sku: string | undefined | null,
  code: string | undefined | null,
  _calculatedPriceInt: number
): string {
  const s = (sku || '').trim();
  if (NUMERIC_SKU_REGEX.test(s)) {
    return s;
  }
  const raw = (code || sku || 'PROD').toString();
  return sanitizeCodeForLabelBarcode(raw);
}

export async function generateUniqueNumericSku(db: ProductDb): Promise<string> {
  const attempts = 100;
  for (let i = 0; i < attempts; i++) {
    const candidate = String(Math.floor(Math.random() * (MAX - MIN + 1)) + MIN);
    const exists = await db.product.findUnique({
      where: { sku: candidate },
      select: { id: true },
    });
    if (!exists) {
      return candidate;
    }
  }

  for (let offset = 0; offset < 1_000_000; offset++) {
    const candidate = String(MIN + ((Date.now() + offset) % (MAX - MIN + 1)));
    const exists = await db.product.findUnique({
      where: { sku: candidate },
      select: { id: true },
    });
    if (!exists) {
      return candidate;
    }
  }

  throw new Error('Unable to allocate a unique 9-digit SKU after many attempts');
}
