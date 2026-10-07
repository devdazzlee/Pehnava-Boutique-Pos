"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const permission_middleware_1 = require("../middleware/permission.middleware");
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const register_report_controller_1 = require("../controllers/register-report.controller");
const register_report_validation_1 = require("../validations/register-report.validation");
const router = express_1.default.Router();
const viewRoles = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'];
const adminRoles = ['SUPER_ADMIN', 'ADMIN'];
router.use(auth_middleware_1.authenticate);
router.get('/', (0, auth_middleware_1.authorize)(viewRoles), (0, validation_middleware_1.validate)(register_report_validation_1.getRegisterReportSchema), register_report_controller_1.getRegisterReport);
router.post('/close', (0, auth_middleware_1.authorize)(viewRoles), (0, validation_middleware_1.validate)(register_report_validation_1.closeRegisterSchema), register_report_controller_1.closeRegisterSession);
router.get('/sessions/:id/expected', (0, auth_middleware_1.authorize)(viewRoles), (0, validation_middleware_1.validate)(register_report_validation_1.registerSessionIdSchema), register_report_controller_1.getRegisterSessionExpected);
router.post('/sessions/:id/reopen', (0, auth_middleware_1.authorize)(viewRoles), (0, validation_middleware_1.validate)(register_report_validation_1.registerSessionIdSchema), (0, permission_middleware_1.requirePermission)('register.reopen'), register_report_controller_1.reopenRegisterSession);
exports.default = router;
//# sourceMappingURL=register-report.routes.js.map