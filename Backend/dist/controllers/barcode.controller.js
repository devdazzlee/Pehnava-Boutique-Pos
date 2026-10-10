"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.printReceipt = exports.getPrinters = void 0;
const barcode_service_1 = require("../services/barcode.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const zebra_barcode_service_1 = require("../services/zebra-barcode.service");
const barcodeService = new barcode_service_1.BarcodeService();
const zebraService = new zebra_barcode_service_1.BarcodeService();
// Get available printers
const getPrinters = (0, asyncHandler_1.default)(async (req, res) => {
    const printers = await barcodeService.getAvailablePrinters();
    new apiResponse_1.ApiResponse(printers, 'Printers fetched successfully').send(res);
});
exports.getPrinters = getPrinters;
// Print receipt
const printReceipt = (0, asyncHandler_1.default)(async (req, res) => {
    console.log('Print receipt request body:', JSON.stringify(req.body, null, 2));
    const { printer, job, receiptData } = req.body || {};
    if (!printer?.name || !receiptData) {
        return res.status(400).json({ success: false, message: 'Missing printer.name or receiptData' });
    }
    const result = await barcodeService.printReceipt({
        printer,
        job: job ?? { copies: 1, cut: true, openDrawer: false },
        receiptData
    });
    new apiResponse_1.ApiResponse(result, 'Receipt sent to printer successfully').send(res);
});
exports.printReceipt = printReceipt;
//# sourceMappingURL=barcode.controller.js.map