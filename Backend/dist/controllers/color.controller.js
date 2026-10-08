"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteColor = exports.listColors = exports.updateColor = exports.getColor = exports.createColor = void 0;
const color_service_1 = require("../services/color.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const colorService = new color_service_1.ColorService();
exports.createColor = (0, asyncHandler_1.default)(async (req, res) => {
    const color = await colorService.createColor(req.body);
    new apiResponse_1.ApiResponse(color, 'Color created successfully', 201).send(res);
});
exports.getColor = (0, asyncHandler_1.default)(async (req, res) => {
    const color = await colorService.getColorById(req.params.id);
    new apiResponse_1.ApiResponse(color, 'Color retrieved successfully').send(res);
});
exports.updateColor = (0, asyncHandler_1.default)(async (req, res) => {
    const color = await colorService.updateColor(req.params.id, req.body);
    new apiResponse_1.ApiResponse(color, 'Color updated successfully').send(res);
});
exports.listColors = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 10, search } = req.query;
    const result = await colorService.listColors({
        page: Number(page),
        limit: Number(limit),
        search: search,
    });
    new apiResponse_1.ApiResponse(result.data, 'Colors retrieved successfully', 200).send(res);
});
exports.deleteColor = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await colorService.deleteColor(req.params.id);
    new apiResponse_1.ApiResponse(null, result.message).send(res);
});
//# sourceMappingURL=color.controller.js.map