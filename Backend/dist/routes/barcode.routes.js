"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const barcode_controller_1 = require("../controllers/barcode.controller");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const print_receipt_pdf_service_1 = require("../services/print-receipt-pdf.service");
const labels_controller_1 = require("../controllers/labels.controller");
const router = express_1.default.Router();
// Get available printers 
router.get('/printers', barcode_controller_1.getPrinters);
// Resolve logo path - handle both src and dist directories
const logoPath = fs_1.default.existsSync(path_1.default.join(__dirname, '../../src/assets/logo.png'))
    ? path_1.default.resolve(__dirname, '../../src/assets/logo.png')
    : path_1.default.resolve(__dirname, '../../assets/logo.png');
console.log('Logo path resolved to:', logoPath);
// Print receipt
router.post('/print-receipt', (0, asyncHandler_1.default)(async (req, res) => {
    const { printer, job, receiptData } = req.body || {};
    if (!printer?.name || !receiptData) {
        return res.status(400).json({ success: false, message: 'Missing printer.name or receiptData' });
    }
    const result = await (0, print_receipt_pdf_service_1.printReceiptPDF)({ printer, job, logoPath, receiptData });
    new apiResponse_1.ApiResponse(result, 'Receipt sent to printer successfully').send(res);
}));
// router.post('/print-zebra', printZebraLikeLabels);
router.post('/print-zebra', labels_controller_1.printLabelsController);
exports.default = router;
//# sourceMappingURL=barcode.routes.js.map