"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SizeService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const catalog_defaults_service_1 = require("./catalog-defaults.service");
class SizeService {
    async createSize(data) {
        const existingSize = await client_1.prisma.size.findFirst({
            where: {
                name: {
                    equals: data.name,
                    mode: 'insensitive',
                },
            },
        });
        if (existingSize)
            throw new apiError_1.AppError(400, 'Size already exists');
        const allSizes = await client_1.prisma.size.findMany({ select: { code: true } });
        const maxCode = allSizes.reduce((max, s) => {
            const parsed = parseInt(s.code, 10);
            return Number.isFinite(parsed) && parsed > max ? parsed : max;
        }, 999);
        const newCode = (maxCode + 1).toString();
        const size = await client_1.prisma.size.create({
            data: {
                ...data,
                code: newCode
            },
        });
        return size;
    }
    async getSizeById(id) {
        const size = await client_1.prisma.size.findUnique({
            where: { id },
            include: {
                products: {
                    select: { id: true, name: true },
                },
            },
        });
        if (!size)
            throw new apiError_1.AppError(404, 'Size not found');
        return size;
    }
    async updateSize(id, data) {
        await this.getSizeById(id);
        return client_1.prisma.size.update({
            where: { id },
            data,
        });
    }
    async listSizes({ page = 1, limit = 10, search, is_active, display_on_pos, }) {
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
        const [sizes, total] = await Promise.all([
            client_1.prisma.size.findMany({
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
            client_1.prisma.size.count({ where }),
        ]);
        return {
            data: sizes.map(s => ({
                ...s,
                product_count: s._count.products,
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
    async deleteSize(id) {
        const size = await client_1.prisma.size.findUnique({ where: { id } });
        if (!size)
            throw new apiError_1.AppError(404, 'Size not found');
        await client_1.prisma.$transaction(async (tx) => {
            const defaultSizeId = await catalog_defaults_service_1.catalogDefaults.ensureDefaultSize(tx, id);
            await tx.product.updateMany({
                where: { size_id: id },
                data: { size_id: defaultSizeId },
            });
            await tx.size.delete({ where: { id } });
        }, catalog_defaults_service_1.catalogDeleteOptions);
        return { message: 'Size deleted successfully' };
    }
}
exports.SizeService = SizeService;
//# sourceMappingURL=size.service.js.map