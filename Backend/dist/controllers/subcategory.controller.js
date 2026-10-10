"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSubcategories = exports.deleteSubcategory = exports.toggleSubcategoryStatus = exports.updateSubcategory = exports.getSubcategory = exports.createSubcategory = void 0;
const subcategory_service_1 = require("../services/subcategory.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const subcategoryService = new subcategory_service_1.SubcategoryService();
exports.createSubcategory = (0, asyncHandler_1.default)(async (req, res) => {
    const subcategory = await subcategoryService.createSubcategory(req.body);
    new apiResponse_1.ApiResponse(subcategory, 'Subcategory created successfully', 201).send(res);
});
exports.getSubcategory = (0, asyncHandler_1.default)(async (req, res) => {
    const subcategory = await subcategoryService.getSubcategoryById(req.params.id);
    new apiResponse_1.ApiResponse(subcategory, 'Subcategory retrieved successfully').send(res);
});
exports.updateSubcategory = (0, asyncHandler_1.default)(async (req, res) => {
    const subcategory = await subcategoryService.updateSubcategory(req.params.id, req.body);
    new apiResponse_1.ApiResponse(subcategory, 'Subcategory updated successfully').send(res);
});
exports.toggleSubcategoryStatus = (0, asyncHandler_1.default)(async (req, res) => {
    await subcategoryService.toggleSubcategoryStatus(req.params.id);
    new apiResponse_1.ApiResponse(null, 'Subcategory status changed successfully').send(res);
});
exports.deleteSubcategory = (0, asyncHandler_1.default)(async (req, res) => {
    await subcategoryService.deleteSubcategory(req.params.id);
    new apiResponse_1.ApiResponse(null, 'Subcategory deleted successfully').send(res);
});
exports.listSubcategories = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 10, search, is_active } = req.query;
    const result = await subcategoryService.listSubcategories({
        page: Number(page),
        limit: Number(limit),
        search: search,
        is_active: is_active ? is_active === 'true' : undefined,
    });
    new apiResponse_1.ApiResponse(result.data, 'Subcategories retrieved successfully', 200).send(res);
});
//# sourceMappingURL=subcategory.controller.js.map