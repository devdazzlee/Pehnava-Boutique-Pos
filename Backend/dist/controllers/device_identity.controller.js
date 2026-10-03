"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addDeviceIdentity = void 0;
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const device_service_1 = __importDefault(require("../services/device.service"));
const deviceIdentityService = new device_service_1.default();
exports.addDeviceIdentity = (0, asyncHandler_1.default)(async (req, res) => {
    const deviceIdentity = await deviceIdentityService.addDeviceFcmToken(req.body);
    new apiResponse_1.ApiResponse(deviceIdentity, 'Data fetched successfully', 200).send(res);
});
//# sourceMappingURL=device_identity.controller.js.map