"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ColorService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const catalog_defaults_service_1 = require("./catalog-defaults.service");
class ColorService {
    async createColor(data) {
        const [existingColor, allColors] = await Promise.all([
            client_1.prisma.color.findFirst({
                where: {
                    name: {
                        equals: data.name,
                        mode: 'insensitive',
                    },
                },
            }),
            client_1.prisma.color.findMany({
                select: { code: true },
            }),
        ]);
        if (existingColor)
            throw new apiError_1.AppError(400, 'Color already exists');
        const maxCode = allColors.reduce((max, c) => {
            const parsed = parseInt(c.code, 10);
            return Number.isFinite(parsed) && parsed > max ? parsed : max;
        }, 999);
        const newCode = (maxCode + 1).toString();
        const color = await client_1.prisma.color.create({
            data: {
                ...data,
                code: newCode
            },
        });
        return color;
    }
    async getColorById(id) {
        const color = await client_1.prisma.color.findUnique({
            where: { id },
            include: {
                products: {
                    select: { id: true, name: true },
                },
            },
        });
        if (!color)
            throw new apiError_1.AppError(404, 'Color not found');
        return color;
    }
    async updateColor(id, data) {
        await this.getColorById(id); // Verify exists
        return client_1.prisma.color.update({
            where: { id },
            data,
        });
    }
    async listColors({ page = 1, limit = 10, search, }) {
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [colors, total] = await Promise.all([
            client_1.prisma.color.findMany({
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
            client_1.prisma.color.count({ where }),
        ]);
        return {
            data: colors.map(c => ({
                ...c,
                product_count: c._count.products,
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
    async deleteColor(id) {
        const color = await client_1.prisma.color.findUnique({ where: { id } });
        if (!color)
            throw new apiError_1.AppError(404, 'Color not found');
        await client_1.prisma.$transaction(async (tx) => {
            const defaultColorId = await catalog_defaults_service_1.catalogDefaults.ensureDefaultColor(tx, id);
            await tx.product.updateMany({
                where: { color_id: id },
                data: { color_id: defaultColorId },
            });
            await tx.color.delete({ where: { id } });
        }, catalog_defaults_service_1.catalogDeleteOptions);
        return { message: 'Color deleted successfully' };
    }
}
exports.ColorService = ColorService;
//# sourceMappingURL=color.service.js.map