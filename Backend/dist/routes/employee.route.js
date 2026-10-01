"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const employee_controller_1 = require("../controllers/employee.controller");
const employee_validation_1 = require("../validations/employee.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const employee_controller_2 = require("../controllers/employee.controller");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['ADMIN', 'SUPER_ADMIN']));
// Employee types (must be before /:id)
router.post('/type', (0, validation_middleware_1.validate)(employee_validation_1.createEmployeeTypeSchema), employee_controller_2.createEmployeeType);
router.get('/types', employee_controller_2.getEmployeeTypes);
router.get('/type/:id', employee_controller_2.getEmployeeTypeById);
router.put('/type/:id', (0, validation_middleware_1.validate)(employee_validation_1.updateEmployeeTypeSchema), employee_controller_2.updateEmployeeType);
router.patch('/type/:id/toggle-status', employee_controller_2.toggleEmployeeType);
router.delete('/type/:id', employee_controller_2.deleteEmployeeType);
// Departments
router.post('/departments', (0, validation_middleware_1.validate)(employee_validation_1.createDepartmentSchema), employee_controller_1.createDepartment);
router.get('/departments', (0, validation_middleware_1.validate)(employee_validation_1.listDepartmentsSchema), employee_controller_1.listDepartments);
router.put('/departments/:id', (0, validation_middleware_1.validate)(employee_validation_1.updateDepartmentSchema), employee_controller_1.updateDepartment);
router.delete('/departments/:id', (0, validation_middleware_1.validate)(employee_validation_1.deleteDepartmentSchema), employee_controller_1.deleteDepartment);
// Bulk import
router.post('/import', (0, validation_middleware_1.validate)(employee_validation_1.importEmployeesSchema), employee_controller_1.importEmployees);
// POS users for linking cashiers → employees (commission)
router.get('/pos-users', employee_controller_1.listPosUsers);
// Deactivate / reactivate
router.patch('/:id/deactivate', (0, validation_middleware_1.validate)(employee_validation_1.deactivateEmployeeSchema), employee_controller_1.deactivateEmployee);
router.patch('/:id/reactivate', (0, validation_middleware_1.validate)(employee_validation_1.reactivateEmployeeSchema), employee_controller_1.reactivateEmployee);
// Detail
router.get('/:id', (0, validation_middleware_1.validate)(employee_validation_1.getEmployeeByIdSchema), employee_controller_1.getEmployeeById);
// CRUD
router.post('/', (0, validation_middleware_1.validate)(employee_validation_1.createEmployeeSchema), employee_controller_1.createEmployee);
router.get('/', (0, validation_middleware_1.validate)(employee_validation_1.listEmployeeSchema), employee_controller_1.listEmployees);
router.put('/:id', (0, validation_middleware_1.validate)(employee_validation_1.updateEmployeeSchema), employee_controller_1.updateEmployee);
router.delete('/:id', (0, validation_middleware_1.validate)(employee_validation_1.deleteEmployeeSchema), employee_controller_1.deleteEmployee);
exports.default = router;
//# sourceMappingURL=employee.route.js.map