"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductCount = exports.suggestProducts = exports.getProductById = exports.listProducts = exports.getCategoryBySlug = exports.getAllCategories = exports.listCategories = exports.getHome = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const web_service_1 = __importDefault(require("../services/web.service"));
const apiResponse_1 = require("../utils/apiResponse");
const webService = new web_service_1.default();
const parseBool = (v) => {
    if (v === undefined || v === null || v === '')
        return undefined;
    if (v === 'true' || v === '1' || v === 1 || v === true)
        return true;
    if (v === 'false' || v === '0' || v === 0 || v === false)
        return false;
    return undefined;
};
const parseNumber = (v) => {
    if (v === undefined || v === null || v === '')
        return undefined;
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return Number.isFinite(n) ? n : undefined;
};
exports.getHome = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await webService.getHome({
        featuredLimit: parseNumber(req.query.featured_limit),
        bestLimit: parseNumber(req.query.best_limit),
        categoriesLimit: parseNumber(req.query.categories_limit),
    });
    new apiResponse_1.ApiResponse(data, 'Home data fetched successfully', 200).send(res);
});
exports.listCategories = (0, asyncHandler_1.default)(async (req, res) => {
    const all = parseBool(req.query.all);
    const result = await webService.listCategories({
        page: parseNumber(req.query.page),
        limit: parseNumber(req.query.limit),
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        all,
    });
    new apiResponse_1.ApiResponse(result.data, 'Categories fetched successfully', 200, true, result.meta).send(res);
});
exports.getAllCategories = (0, asyncHandler_1.default)(async (_req, res) => {
    const result = await webService.listCategories({ all: true });
    new apiResponse_1.ApiResponse(result.data, 'Categories fetched successfully', 200, true, result.meta).send(res);
});
exports.getCategoryBySlug = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await webService.getCategoryBySlug(req.params.slug, {
        page: parseNumber(req.query.page),
        limit: parseNumber(req.query.limit),
        sort: req.query.sort,
    });
    new apiResponse_1.ApiResponse(data, 'Category fetched successfully', 200).send(res);
});
exports.listProducts = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await webService.listProducts({
        page: parseNumber(req.query.page),
        limit: parseNumber(req.query.limit),
        search: typeof req.query.search === 'string' ? req.query.search : req.query.q,
        category_id: typeof req.query.category_id === 'string' ? req.query.category_id : undefined,
        category_slug: typeof req.query.category === 'string' ? req.query.category : undefined,
        subcategory_id: typeof req.query.subcategory_id === 'string' ? req.query.subcategory_id : undefined,
        min_price: parseNumber(req.query.min_price),
        max_price: parseNumber(req.query.max_price),
        sort: req.query.sort,
        featured: parseBool(req.query.featured),
    });
    new apiResponse_1.ApiResponse(result.data, 'Products fetched successfully', 200, true, result.meta).send(res);
});
exports.getProductById = (0, asyncHandler_1.default)(async (req, res) => {
    const product = await webService.getProductById(req.params.id);
    new apiResponse_1.ApiResponse(product, 'Product fetched successfully', 200).send(res);
});
exports.suggestProducts = (0, asyncHandler_1.default)(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = parseNumber(req.query.limit) ?? 8;
    const suggestions = await webService.suggestProducts(q, limit);
    new apiResponse_1.ApiResponse(suggestions, 'Suggestions fetched successfully', 200).send(res);
});
exports.getProductCount = (0, asyncHandler_1.default)(async (_req, res) => {
    const data = await webService.getProductCount();
    new apiResponse_1.ApiResponse(data, 'Product count fetched successfully', 200).send(res);
});
//# sourceMappingURL=web.controller.js.map