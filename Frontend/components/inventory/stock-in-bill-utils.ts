export function billInvoiceLabel(invoiceRef?: string | null): string {
  const inv = invoiceRef?.trim();
  return inv || "Direct stock-in";
}

export function formatBillProductSummary(
  lines: Array<{ product?: { name?: string | null } | null }> | undefined,
  lineCount: number,
): string | null {
  if (!lines?.length || lineCount <= 1) return null;
  const names = lines
    .map((l) => l.product?.name?.trim())
    .filter(Boolean) as string[];
  if (names.length === 0) return null;
  const first = names[0];
  const rest = lineCount - 1;
  if (rest <= 0) return first;
  if (names.length >= 2 && rest === 1) {
    return `${first} · ${names[1]}`;
  }
  return `${first} +${rest} more`;
}
