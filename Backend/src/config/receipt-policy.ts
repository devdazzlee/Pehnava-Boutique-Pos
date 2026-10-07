/** Sale receipt footer — keep in sync with Frontend/config/constants.ts */
export const RECEIPT_EXCHANGE_POLICY_TITLE = 'EXCHANGE POLICY';
export const RECEIPT_EXCHANGE_POLICY_LINES = [
  'Exchange within 7 days.',
  'No returns. Exchange only.',
  'Price difference applies.',
] as const;

export function shouldPrintReceiptExchangePolicy(receiptData: {
  documentTitle?: string | null;
}): boolean {
  return !receiptData.documentTitle?.trim();
}
