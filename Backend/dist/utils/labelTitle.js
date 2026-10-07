"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BARCODE_LABEL_BRAND_PREFIX = void 0;
exports.formatBarcodeLabelTitle = formatBarcodeLabelTitle;
/** Keep in sync with Frontend `formatBarcodeLabelTitle` / BARCODE_LABEL_BRAND_PREFIX. */
exports.BARCODE_LABEL_BRAND_PREFIX = 'PEHNAWA';
function formatBarcodeLabelTitle(productName) {
    const name = (productName || '').trim();
    if (!name)
        return exports.BARCODE_LABEL_BRAND_PREFIX;
    const upper = name.toUpperCase();
    const brand = exports.BARCODE_LABEL_BRAND_PREFIX.toUpperCase();
    if (upper.startsWith(`${brand} `))
        return upper;
    if (upper.startsWith('PEHNAVA '))
        return `${brand} ${upper.slice(8)}`;
    return `${brand} ${upper}`;
}
//# sourceMappingURL=labelTitle.js.map