"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDayReport = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const day_report_service_1 = require("../services/day-report.service");
const service = new day_report_service_1.DayReportService();
exports.getDayReport = (0, asyncHandler_1.default)(async (req, res) => {
    const report = await service.report({
        from: String(req.query.from),
        to: String(req.query.to),
        view: String(req.query.view || 'revenue'),
        search: req.query.search ? String(req.query.search) : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20,
        branchId: req.query.branchId ? String(req.query.branchId) : undefined,
        userRole: req.user?.role,
        userBranchId: req.user?.branch_id,
    });
    new apiResponse_1.ApiResponse(report, 'Day report generated').send(res);
});
//# sourceMappingURL=day-report.controller.js.map