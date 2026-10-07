"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECEIPT_EXCHANGE_POLICY_LINES = exports.RECEIPT_EXCHANGE_POLICY_TITLE = void 0;
exports.shouldPrintReceiptExchangePolicy = shouldPrintReceiptExchangePolicy;
/** Sale receipt footer — keep in sync with Frontend/config/constants.ts */
exports.RECEIPT_EXCHANGE_POLICY_TITLE = 'EXCHANGE POLICY';
exports.RECEIPT_EXCHANGE_POLICY_LINES = [
    'Exchange within 7 days.',
    'No returns. Exchange only.',
    'Price difference applies.',
];
function shouldPrintReceiptExchangePolicy(receiptData) {
    return !receiptData.documentTitle?.trim();
}
//# sourceMappingURL=receipt-policy.js.map