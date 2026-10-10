"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCategories = exports.getProductById = exports.searchProducts = exports.getHomeData = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const app_service_1 = __importDefault(require("../services/app.service"));
const apiResponse_1 = require("../utils/apiResponse");
const apiError_1 = require("../utils/apiError");
const appService = new app_service_1.default();
exports.getHomeData = (0, asyncHandler_1.default)(async (req, res) => {
    const homeData = await appService.getHomeData();
    new apiResponse_1.ApiResponse(homeData, 'Data fetched successfully', 200).send(res);
});
exports.searchProducts = (0, asyncHandler_1.default)(async (req, res) => {
    const searchQuery = req.query.search;
    const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
    const searchedProducts = await appService.searchProducts(searchQuery, limit);
    new apiResponse_1.ApiResponse(searchedProducts, 'Data fetched successfully', 200).send(res);
});
exports.getProductById = (0, asyncHandler_1.default)(async (req, res) => {
    const product = await appService.getProductById(req.params.id);
    if (!product || !product.is_active || product.display_on_website === false) {
        throw new apiError_1.AppError(404, "Product not found");
    }
    new apiResponse_1.ApiResponse(product, 'Product fetched successfully', 200).send(res);
});
exports.getCategories = (0, asyncHandler_1.default)(async (_req, res) => {
    const categories = await appService.getCategories();
    new apiResponse_1.ApiResponse(categories, 'Categories fetched successfully', 200).send(res);
});
//# sourceMappingURL=app.controller.js.map