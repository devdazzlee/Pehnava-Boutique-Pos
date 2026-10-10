"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReportsData = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const reports_service_1 = require("../services/reports.service");
const apiResponse_1 = require("../utils/apiResponse");
const reportsService = new reports_service_1.ReportsService();
/**
 * Get reports data (sales, products, stats)
 */
exports.getReportsData = (0, asyncHandler_1.default)(async (req, res) => {
    const branchId = req.user?.branch_id;
    const userRole = req.user?.role;
    const { limit } = req.query;
    const [sales, bestSellingProducts, stats] = await Promise.all([
        reportsService.getSalesForReports({ branchId, userRole }),
        reportsService.getBestSellingProducts({
            branchId,
            userRole,
            limit: limit ? Number(limit) : 10,
        }),
        reportsService.getReportsStats({ branchId, userRole }),
    ]);
    new apiResponse_1.ApiResponse({
        sales,
        bestSellingProducts,
        stats,
    }, 'Reports data fetched successfully').send(res);
});
//# sourceMappingURL=reports.controller.js.map