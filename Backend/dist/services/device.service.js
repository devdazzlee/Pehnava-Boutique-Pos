"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../prisma/client");
class DeviceIdentityService {
    async addDeviceFcmToken(data) {
        const device = await client_1.prisma.deviceIdentity.create({
            data: { fcm_token: data.fcm_token },
            select: {
                fcm_token: true
            },
        });
        return device;
    }
}
exports.default = DeviceIdentityService;
//# sourceMappingURL=device.service.js.map