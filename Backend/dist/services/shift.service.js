"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShiftService = void 0;
const client_1 = require("../prisma/client");
class ShiftService {
    async createShift(data) {
        const shift = await client_1.prisma.shift.create({
            data,
        });
        return shift;
    }
    async listShifts({ page = 1, limit = 10 }) {
        const [shifts, total] = await Promise.all([
            client_1.prisma.shift.findMany({
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { start_time: 'asc' },
            }),
            client_1.prisma.shift.count(),
        ]);
        return {
            data: shifts,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    async updateShift(id, data) {
        const shift = await client_1.prisma.shift.update({
            where: { id },
            data,
        });
        return shift;
    }
    async deleteShift(id) {
        const shift = await client_1.prisma.shift.delete({
            where: { id },
        });
        return shift;
    }
}
exports.ShiftService = ShiftService;
//# sourceMappingURL=shift.service.js.map