"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const salary_controller_1 = require("../controllers/salary.controller");
const salary_validation_1 = require("../validations/salary.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']));
router.post('/', (0, validation_middleware_1.validate)(salary_validation_1.createSalarySchema), salary_controller_1.createSalary);
router.get('/', (0, validation_middleware_1.validate)(salary_validation_1.listSalariesSchema), salary_controller_1.listSalaries);
router.get('/:id', (0, validation_middleware_1.validate)(salary_validation_1.salaryIdParamSchema), salary_controller_1.getSalaryById);
router.put('/:id', (0, validation_middleware_1.validate)(salary_validation_1.updateSalarySchema), salary_controller_1.updateSalary);
router.patch('/:id/mark-paid', (0, validation_middleware_1.validate)(salary_validation_1.markSalaryPaidSchema), salary_controller_1.markSalaryPaid);
router.patch('/:id/mark-unpaid', (0, validation_middleware_1.validate)(salary_validation_1.salaryIdParamSchema), salary_controller_1.markSalaryUnpaid);
router.delete('/:id', (0, validation_middleware_1.validate)(salary_validation_1.salaryIdParamSchema), salary_controller_1.deleteSalary);
exports.default = router;
//# sourceMappingURL=salary.route.js.map