"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUnit = exports.listUnits = exports.updateUnit = exports.getUnit = exports.createUnit = void 0;
const unit_service_1 = require("../services/unit.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const unitService = new unit_service_1.UnitService();
exports.createUnit = (0, asyncHandler_1.default)(async (req, res) => {
    const unit = await unitService.createUnit(req.body);
    new apiResponse_1.ApiResponse(unit, 'Unit created successfully', 201).send(res);
});
exports.getUnit = (0, asyncHandler_1.default)(async (req, res) => {
    const unit = await unitService.getUnitById(req.params.id);
    new apiResponse_1.ApiResponse(unit, 'Unit retrieved successfully').send(res);
});
exports.updateUnit = (0, asyncHandler_1.default)(async (req, res) => {
    const unit = await unitService.updateUnit(req.params.id, req.body);
    new apiResponse_1.ApiResponse(unit, 'Unit updated successfully').send(res);
});
exports.listUnits = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 10, search } = req.query;
    const result = await unitService.listUnits({
        page: Number(page),
        limit: Number(limit),
        search: search,
    });
    new apiResponse_1.ApiResponse(result.data, 'Units retrieved successfully', 200).send(res);
});
exports.deleteUnit = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await unitService.deleteUnit(req.params.id);
    new apiResponse_1.ApiResponse(null, result.message).send(res);
});
//# sourceMappingURL=unit.controller.js.map