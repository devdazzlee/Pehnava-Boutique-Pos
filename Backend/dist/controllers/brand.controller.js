"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBrand = exports.listBrands = exports.toggleBrandDisplay = exports.updateBrand = exports.getBrand = exports.createBrand = void 0;
const brand_service_1 = require("../services/brand.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const brandService = new brand_service_1.BrandService();
exports.createBrand = (0, asyncHandler_1.default)(async (req, res) => {
    const brand = await brandService.createBrand(req.body);
    new apiResponse_1.ApiResponse(brand, 'Brand created successfully', 201).send(res);
});
exports.getBrand = (0, asyncHandler_1.default)(async (req, res) => {
    const brand = await brandService.getBrandById(req.params.id);
    new apiResponse_1.ApiResponse(brand, 'Brand retrieved successfully').send(res);
});
exports.updateBrand = (0, asyncHandler_1.default)(async (req, res) => {
    const brand = await brandService.updateBrand(req.params.id, req.body);
    new apiResponse_1.ApiResponse(brand, 'Brand updated successfully').send(res);
});
exports.toggleBrandDisplay = (0, asyncHandler_1.default)(async (req, res) => {
    await brandService.toggleBrandDisplay(req.params.id);
    new apiResponse_1.ApiResponse(null, 'Brand display status changed successfully').send(res);
});
exports.listBrands = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 10, search } = req.query;
    const result = await brandService.listBrands({
        page: Number(page),
        limit: Number(limit),
        search: search,
    });
    new apiResponse_1.ApiResponse(result.data, 'Brands retrieved successfully', 200).send(res);
});
exports.deleteBrand = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await brandService.deleteBrand(req.params.id);
    new apiResponse_1.ApiResponse(null, result.message).send(res);
});
//# sourceMappingURL=brand.controller.js.map