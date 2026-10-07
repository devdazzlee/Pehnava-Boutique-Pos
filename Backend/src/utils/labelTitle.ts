/** Keep in sync with Frontend `formatBarcodeLabelTitle` / BARCODE_LABEL_BRAND_PREFIX. */
export const BARCODE_LABEL_BRAND_PREFIX = 'PEHNAWA';

export function formatBarcodeLabelTitle(productName: string): string {
  const name = (productName || '').trim();
  if (!name) return BARCODE_LABEL_BRAND_PREFIX;
  const upper = name.toUpperCase();
  const brand = BARCODE_LABEL_BRAND_PREFIX.toUpperCase();
  if (upper.startsWith(`${brand} `)) return upper;
  if (upper.startsWith('PEHNAVA ')) return `${brand} ${upper.slice(8)}`;
  return `${brand} ${upper}`;
}
