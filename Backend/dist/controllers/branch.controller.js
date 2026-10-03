"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertBranchCredentials = exports.getBranchCredentials = exports.deleteBranch = exports.getBranchDetails = exports.listBranches = exports.toggleBranchStatus = exports.updateBranch = exports.getBranch = exports.createBranch = void 0;
const branch_service_1 = require("../services/branch.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const branchService = new branch_service_1.BranchService();
exports.createBranch = (0, asyncHandler_1.default)(async (req, res) => {
    const branch = await branchService.createBranch(req.body);
    new apiResponse_1.ApiResponse(branch, 'Branch created successfully', 201).send(res);
});
exports.getBranch = (0, asyncHandler_1.default)(async (req, res) => {
    const branch = await branchService.getBranchById(req.params.id);
    new apiResponse_1.ApiResponse(branch, 'Branch retrieved successfully').send(res);
});
exports.updateBranch = (0, asyncHandler_1.default)(async (req, res) => {
    const branch = await branchService.updateBranch(req.params.id, req.body);
    new apiResponse_1.ApiResponse(branch, 'Branch updated successfully').send(res);
});
exports.toggleBranchStatus = (0, asyncHandler_1.default)(async (req, res) => {
    await branchService.toggleBranchStatus(req.params.id);
    new apiResponse_1.ApiResponse(null, 'Branch status changed successfully').send(res);
});
exports.listBranches = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 10, search, is_active, fetch_all } = req.query;
    const result = await branchService.listBranches({
        page: Number(page),
        limit: Number(limit),
        search: search,
        is_active: is_active ? is_active === 'true' : undefined,
        fetch_all: fetch_all === 'true',
    });
    new apiResponse_1.ApiResponse(result.data, 'Branches retrieved successfully', 200, true, result.meta).send(res);
});
exports.getBranchDetails = (0, asyncHandler_1.default)(async (req, res) => {
    const branchId = req.params.id;
    const branchDetails = await branchService.getBranchDetails(branchId);
    new apiResponse_1.ApiResponse(branchDetails, 'Branch details retrieved successfully').send(res);
});
exports.deleteBranch = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await branchService.deleteBranch(req.params.id);
    new apiResponse_1.ApiResponse(null, result.message).send(res);
});
exports.getBranchCredentials = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await branchService.getBranchCredentials(req.params.id);
    new apiResponse_1.ApiResponse(result, 'Branch login fetched successfully').send(res);
});
exports.upsertBranchCredentials = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await branchService.upsertBranchCredentials(req.params.id, req.body);
    new apiResponse_1.ApiResponse(result, 'Branch login saved successfully').send(res);
});
//# sourceMappingURL=branch.controller.js.map