"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteShift = exports.updateShift = exports.listShifts = exports.createShift = void 0;
const shift_service_1 = require("../services/shift.service");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const shiftService = new shift_service_1.ShiftService();
exports.createShift = (0, asyncHandler_1.default)(async (req, res) => {
    const shift = await shiftService.createShift(req.body);
    new apiResponse_1.ApiResponse(shift, 'Shift created successfully', 201).send(res);
});
exports.listShifts = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const result = await shiftService.listShifts({ page: Number(page), limit: Number(limit) });
    new apiResponse_1.ApiResponse(result.data, 'Shifts retrieved successfully', 200).send(res);
});
exports.updateShift = (0, asyncHandler_1.default)(async (req, res) => {
    const { id } = req.params;
    const updatedShift = await shiftService.updateShift(id, req.body);
    new apiResponse_1.ApiResponse(updatedShift, 'Shift updated successfully', 200).send(res);
});
exports.deleteShift = (0, asyncHandler_1.default)(async (req, res) => {
    const { id } = req.params;
    await shiftService.deleteShift(id);
    new apiResponse_1.ApiResponse(null, 'Shift deleted successfully', 200).send(res);
});
//# sourceMappingURL=shift.controller.js.map