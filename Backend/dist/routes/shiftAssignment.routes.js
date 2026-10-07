"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const shiftAssignment_controller_1 = require("../controllers/shiftAssignment.controller");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const shiftAssignment_validation_1 = require("../validations/shiftAssignment.validation");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['ADMIN', 'SUPER_ADMIN']));
router.post('/', (0, validation_middleware_1.validate)(shiftAssignment_validation_1.assignShiftSchema), shiftAssignment_controller_1.assignShift);
router.get('/', (0, validation_middleware_1.validate)(shiftAssignment_validation_1.listShiftAssignmentsSchema), shiftAssignment_controller_1.getAllShifts);
router.get('/current/:employee_id', (0, validation_middleware_1.validate)(shiftAssignment_validation_1.employeeIdParamSchema), shiftAssignment_controller_1.getCurrentShift);
router.get('/history/:employee_id', (0, validation_middleware_1.validate)(shiftAssignment_validation_1.employeeIdParamSchema), shiftAssignment_controller_1.getShiftHistory);
router.patch('/end/:employee_id', (0, validation_middleware_1.validate)(shiftAssignment_validation_1.endShiftBodySchema), shiftAssignment_controller_1.endCurrentShift);
router.patch('/:id/end', (0, validation_middleware_1.validate)(shiftAssignment_validation_1.endShiftByIdSchema), shiftAssignment_controller_1.endShiftById);
router.patch('/:id', (0, validation_middleware_1.validate)(shiftAssignment_validation_1.updateShiftAssignmentSchema), shiftAssignment_controller_1.updateShift);
router.delete('/:id', (0, validation_middleware_1.validate)(shiftAssignment_validation_1.shiftAssignmentIdParamSchema), shiftAssignment_controller_1.deleteShift);
exports.default = router;
//# sourceMappingURL=shiftAssignment.routes.js.map