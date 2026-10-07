"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const device_identity_controller_1 = require("../controllers/device_identity.controller");
const validation_middleware_1 = require("../middleware/validation.middleware");
const device_identity_validation_1 = require("../validations/device_identity.validation");
const router = express_1.default.Router();
router.post('/', (0, validation_middleware_1.validate)(device_identity_validation_1.deviceIdentitySchema), device_identity_controller_1.addDeviceIdentity);
exports.default = router;
//# sourceMappingURL=device_identity.routes.js.map