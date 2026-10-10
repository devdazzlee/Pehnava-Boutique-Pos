"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const color_controller_1 = require("../controllers/color.controller");
const color_validation_1 = require("../validations/color.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']));
router.post('/', (0, validation_middleware_1.validate)(color_validation_1.createColorSchema), color_controller_1.createColor);
router.get('/', (0, validation_middleware_1.validate)(color_validation_1.listColorsSchema), color_controller_1.listColors);
router.get('/:id', (0, validation_middleware_1.validate)(color_validation_1.getColorSchema), color_controller_1.getColor);
router.patch('/:id', (0, validation_middleware_1.validate)(color_validation_1.updateColorSchema), color_controller_1.updateColor);
router.delete('/:id', (0, validation_middleware_1.validate)(color_validation_1.getColorSchema), color_controller_1.deleteColor);
exports.default = router;
//# sourceMappingURL=color.routes.js.map