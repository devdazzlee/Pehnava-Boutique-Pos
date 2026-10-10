"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testPrinterSchema = exports.printBarcodesSchema = void 0;
const zod_1 = require("zod");
const productSchema = zod_1.z.object({
    id: zod_1.z.string().min(1, 'Product ID is required'),
    name: zod_1.z.string().min(1, 'Product name is required'),
    sku: zod_1.z.string().optional(),
    code: zod_1.z.string().optional(),
    sales_rate_exc_dis_and_tax: zod_1.z.number().optional(),
    netWeight: zod_1.z.string().min(1, 'Net weight is required'),
    packageDate: zod_1.z.string().min(1, 'Package date is required'),
    expiryDate: zod_1.z.string().min(1, 'Expiry date is required'),
});
const printSettingsSchema = zod_1.z.object({
    paperSize: zod_1.z.string().optional(),
    copies: zod_1.z.number().min(1).max(10).optional(),
});
exports.printBarcodesSchema = zod_1.z.object({
    body: zod_1.z.object({
        products: zod_1.z.array(productSchema).min(1, 'At least one product is required'),
        printerName: zod_1.z.string().min(1, 'Printer name is required'),
        settings: printSettingsSchema.optional(),
    })
});
exports.testPrinterSchema = zod_1.z.object({
    body: zod_1.z.object({
        printerName: zod_1.z.string().min(1, 'Printer name is required'),
    })
});
//# sourceMappingURL=barcode.validation.js.map