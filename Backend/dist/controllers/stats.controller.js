"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardStats = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const stats_service_1 = require("../services/stats.service");
const apiResponse_1 = require("../utils/apiResponse");
const resolveBranchId_1 = require("../utils/resolveBranchId");
const statsService = new stats_service_1.StatsService();
exports.dashboardStats = (0, asyncHandler_1.default)(async (req, res) => {
    const branchId = (0, resolveBranchId_1.resolveBranchId)(req);
    const stats = await statsService.getDashboardStats(branchId);
    new apiResponse_1.ApiResponse(stats, 'Dashboard stats fetched', 200).send(res);
});
//# sourceMappingURL=stats.controller.js.map