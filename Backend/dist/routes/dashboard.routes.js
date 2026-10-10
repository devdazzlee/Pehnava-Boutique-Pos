"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const stats_controller_1 = require("../controllers/stats.controller");
const day_report_controller_1 = require("../controllers/day-report.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const day_report_validation_1 = require("../validations/day-report.validation");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PURCHASE_MANAGER']));
router.get('/stats', stats_controller_1.dashboardStats);
router.get('/day-report', (0, validation_middleware_1.validate)(day_report_validation_1.dayReportSchema), day_report_controller_1.getDayReport);
exports.default = router;
//# sourceMappingURL=dashboard.routes.js.map