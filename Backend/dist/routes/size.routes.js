"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const size_controller_1 = require("../controllers/size.controller");
const size_validation_1 = require("../validations/size.validation");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']));
router.post('/', (0, validation_middleware_1.validate)(size_validation_1.createSizeSchema), size_controller_1.createSize);
router.get('/', (0, validation_middleware_1.validate)(size_validation_1.listSizesSchema), size_controller_1.listSizes);
router.get('/:id', (0, validation_middleware_1.validate)(size_validation_1.getSizeSchema), size_controller_1.getSize);
router.patch('/:id', (0, validation_middleware_1.validate)(size_validation_1.updateSizeSchema), size_controller_1.updateSize);
router.delete('/:id', (0, validation_middleware_1.validate)(size_validation_1.getSizeSchema), size_controller_1.deleteSize);
exports.default = router;
//# sourceMappingURL=size.routes.js.map