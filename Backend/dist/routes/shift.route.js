"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const shift_controller_1 = require("../controllers/shift.controller");
const shift_validation_1 = require("../validations/shift.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const shift_controller_2 = require("../controllers/shift.controller");
const shift_validation_2 = require("../validations/shift.validation");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']));
router.post('/', (0, validation_middleware_1.validate)(shift_validation_1.createShiftSchema), shift_controller_1.createShift);
router.get('/', (0, validation_middleware_1.validate)(shift_validation_1.listShiftsSchema), shift_controller_1.listShifts);
router.put('/:id', (0, validation_middleware_1.validate)(shift_validation_2.shiftIdParamSchema), shift_controller_2.updateShift);
router.delete('/:id', (0, validation_middleware_1.validate)(shift_validation_2.shiftIdParamSchema), shift_controller_2.deleteShift);
exports.default = router;
//# sourceMappingURL=shift.route.js.map