"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaxService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
class TaxService {
    async createTax(data) {
        const [existingTax, lastTax] = await Promise.all([
            client_1.prisma.tax.findFirst({
                where: {
                    name: data.name,
                },
            }),
            client_1.prisma.tax.findFirst({
                orderBy: { created_at: 'desc' },
                select: { code: true },
            }),
        ]);
        if (existingTax)
            throw new apiError_1.AppError(400, 'Tax already exists');
        const newCode = lastTax ? (parseInt(lastTax.code) + 1).toString() : '1000';
        const tax = await client_1.prisma.tax.create({
            data: {
                ...data,
                code: newCode
            },
        });
        return tax;
    }
    async getTaxById(id) {
        const tax = await client_1.prisma.tax.findUnique({
            where: { id },
            include: {
                products: {
                    select: { id: true, name: true },
                },
            },
        });
        if (!tax)
            throw new apiError_1.AppError(404, 'Tax not found');
        return tax;
    }
    async updateTax(id, data) {
        await this.getTaxById(id); // Verify exists
        return client_1.prisma.tax.update({
            where: { id },
            data,
        });
    }
    async toggletaxestatus(id) {
        const tax = await this.getTaxById(id);
        return client_1.prisma.tax.update({
            where: { id },
            data: { is_active: !tax.is_active },
        });
    }
    async listTaxes({ page = 1, limit = 10, search, is_active = true, display_on_pos = true, }) {
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (is_active !== undefined) {
            where.is_active = is_active;
        }
        if (display_on_pos !== undefined) {
            where.display_on_pos = display_on_pos;
        }
        const [taxes, total] = await Promise.all([
            client_1.prisma.tax.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    _count: {
                        select: { products: true },
                    },
                },
            }),
            client_1.prisma.tax.count({ where }),
        ]);
        return {
            data: taxes.map(t => ({
                ...t,
                product_count: t._count.products,
                _count: undefined,
            })),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}
exports.TaxService = TaxService;
//# sourceMappingURL=tax.service.js.map