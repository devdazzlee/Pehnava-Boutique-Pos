"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteShift = exports.updateShift = exports.getAllShifts = exports.endShiftById = exports.endCurrentShift = exports.getShiftHistory = exports.getCurrentShift = exports.assignShift = void 0;
const shiftAssignment_service_1 = require("../services/shiftAssignment.service");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const shiftAssignmentService = new shiftAssignment_service_1.ShiftAssignmentService();
exports.assignShift = (0, asyncHandler_1.default)(async (req, res) => {
    const assignment = await shiftAssignmentService.assignShift(req.body);
    new apiResponse_1.ApiResponse(assignment, 'Shift assigned successfully', 201).send(res);
});
exports.getCurrentShift = (0, asyncHandler_1.default)(async (req, res) => {
    const { employee_id } = req.params;
    const currentShift = await shiftAssignmentService.getCurrentShift(employee_id);
    new apiResponse_1.ApiResponse(currentShift, 'Current shift fetched successfully', 200).send(res);
});
exports.getShiftHistory = (0, asyncHandler_1.default)(async (req, res) => {
    const { employee_id } = req.params;
    const history = await shiftAssignmentService.getShiftHistory(employee_id);
    new apiResponse_1.ApiResponse(history, 'Shift history fetched successfully', 200).send(res);
});
exports.endCurrentShift = (0, asyncHandler_1.default)(async (req, res) => {
    const { employee_id } = req.params;
    const sales = req.body?.sales !== undefined && req.body?.sales !== null
        ? Number(req.body.sales)
        : undefined;
    const updated = await shiftAssignmentService.endCurrentShift(employee_id, new Date(), sales);
    new apiResponse_1.ApiResponse(updated, 'Current shift ended successfully', 200).send(res);
});
exports.endShiftById = (0, asyncHandler_1.default)(async (req, res) => {
    const { id } = req.params;
    const sales = req.body?.sales !== undefined && req.body?.sales !== null
        ? Number(req.body.sales)
        : undefined;
    const updated = await shiftAssignmentService.endShiftById(id, sales);
    new apiResponse_1.ApiResponse(updated, 'Shift ended successfully', 200).send(res);
});
exports.getAllShifts = (0, asyncHandler_1.default)(async (req, res) => {
    const q = req.query;
    const fetchAllRaw = q.fetch_all;
    const fetch_all = fetchAllRaw === true ||
        fetchAllRaw === 'true' ||
        (!q.page && !q.limit);
    const result = await shiftAssignmentService.listShifts({
        page: q.page ? Number(q.page) : undefined,
        limit: q.limit ? Number(q.limit) : undefined,
        fetch_all,
        search: typeof q.search === 'string' ? q.search : undefined,
        employee_id: typeof q.employee_id === 'string' ? q.employee_id : undefined,
        status: q.status,
        date_from: typeof q.date_from === 'string' ? q.date_from : undefined,
        date_to: typeof q.date_to === 'string' ? q.date_to : undefined,
        period: q.period,
    });
    new apiResponse_1.ApiResponse(result.data, 'All shifts fetched successfully', 200, true, result.meta).send(res);
});
exports.updateShift = (0, asyncHandler_1.default)(async (req, res) => {
    const { id } = req.params;
    const updated = await shiftAssignmentService.updateShift(id, req.body);
    new apiResponse_1.ApiResponse(updated, 'Shift updated successfully', 200).send(res);
});
exports.deleteShift = (0, asyncHandler_1.default)(async (req, res) => {
    const { id } = req.params;
    const result = await shiftAssignmentService.deleteShift(id);
    new apiResponse_1.ApiResponse(result, 'Shift deleted successfully', 200).send(res);
});
//# sourceMappingURL=shiftAssignment.controller.js.map