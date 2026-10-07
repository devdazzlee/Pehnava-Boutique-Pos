"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deviceIdentitySchema = void 0;
const zod_1 = require("zod");
const deviceIdentitySchema = zod_1.z.object({
    body: zod_1.z.object({
        fcm_token: zod_1.z.string().min(1, 'FCM Token is required'),
    }),
});
exports.deviceIdentitySchema = deviceIdentitySchema;
//# sourceMappingURL=device_identity.validation.js.map