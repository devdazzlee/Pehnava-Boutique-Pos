"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const unit_controller_1 = require("../controllers/unit.controller");
const unit_validation_1 = require("../validations/unit.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']));
router.post('/', (0, validation_middleware_1.validate)(unit_validation_1.createUnitSchema), unit_controller_1.createUnit);
router.get('/', (0, validation_middleware_1.validate)(unit_validation_1.listUnitsSchema), unit_controller_1.listUnits);
router.get('/:id', (0, validation_middleware_1.validate)(unit_validation_1.getUnitSchema), unit_controller_1.getUnit);
router.patch('/:id', (0, validation_middleware_1.validate)(unit_validation_1.updateUnitSchema), unit_controller_1.updateUnit);
router.delete('/:id', (0, validation_middleware_1.validate)(unit_validation_1.getUnitSchema), unit_controller_1.deleteUnit);
exports.default = router;
//# sourceMappingURL=unit.routes.js.map