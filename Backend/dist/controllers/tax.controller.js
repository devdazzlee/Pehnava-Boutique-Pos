"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTaxes = exports.toggletaxestatus = exports.updateTax = exports.getTax = exports.createTax = void 0;
const tax_service_1 = require("../services/tax.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const taxService = new tax_service_1.TaxService();
exports.createTax = (0, asyncHandler_1.default)(async (req, res) => {
    const tax = await taxService.createTax(req.body);
    new apiResponse_1.ApiResponse(tax, 'Tax created successfully', 201).send(res);
});
exports.getTax = (0, asyncHandler_1.default)(async (req, res) => {
    const tax = await taxService.getTaxById(req.params.id);
    new apiResponse_1.ApiResponse(tax, 'Tax retrieved successfully').send(res);
});
exports.updateTax = (0, asyncHandler_1.default)(async (req, res) => {
    const tax = await taxService.updateTax(req.params.id, req.body);
    new apiResponse_1.ApiResponse(tax, 'Tax updated successfully').send(res);
});
exports.toggletaxestatus = (0, asyncHandler_1.default)(async (req, res) => {
    await taxService.toggletaxestatus(req.params.id);
    new apiResponse_1.ApiResponse(null, 'Tax status changed successfully').send(res);
});
exports.listTaxes = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 10, search, is_active } = req.query;
    const result = await taxService.listTaxes({
        page: Number(page),
        limit: Number(limit),
        search: search,
        is_active: is_active ? is_active === 'true' : undefined,
    });
    new apiResponse_1.ApiResponse(result.data, 'Taxes retrieved successfully', 200).send(res);
});
//# sourceMappingURL=tax.controller.js.map