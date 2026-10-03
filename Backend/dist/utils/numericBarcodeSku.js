"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NUMERIC_SKU_REGEX = void 0;
exports.isNineDigitNumericSku = isNineDigitNumericSku;
exports.encodeLabelBarcodeValue = encodeLabelBarcodeValue;
exports.generateUniqueNumericSku = generateUniqueNumericSku;
/** Product `sku` doubles as scannable barcode: exactly 9 digits, globally unique. */
exports.NUMERIC_SKU_REGEX = /^\d{9}$/;
const MIN = 100_000_000;
const MAX = 999_999_999;
function isNineDigitNumericSku(value) {
    if (value === undefined || value === null)
        return false;
    return exports.NUMERIC_SKU_REGEX.test(String(value).trim());
}
/**
 * Value encoded on labels / Zebra: 9-digit SKU only when SKU matches rule;
 * otherwise legacy `SANITIZED-PRICE` for older products until SKU is migrated.
 */
function encodeLabelBarcodeValue(sku, code, calculatedPriceInt) {
    const s = (sku || '').trim();
    if (exports.NUMERIC_SKU_REGEX.test(s)) {
        return s;
    }
    const raw = (sku || code || 'PROD').toString();
    const sanitized = raw.replace(/[^A-Za-z0-9]/g, '') || 'PROD';
    return `${sanitized}-${Math.round(calculatedPriceInt)}`;
}
async function generateUniqueNumericSku(db) {
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
//# sourceMappingURL=numericBarcodeSku.js.map