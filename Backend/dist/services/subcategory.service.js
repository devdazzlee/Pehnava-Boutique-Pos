"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubcategoryService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const catalog_defaults_service_1 = require("./catalog-defaults.service");
class SubcategoryService {
    async createSubcategory(data) {
        const existingSubcategory = await client_1.prisma.subcategory.findFirst({
            where: {
                name: data.name,
                is_active: true,
            },
        });
        if (existingSubcategory) {
            throw new apiError_1.AppError(400, 'Subcategory with this name already exists');
        }
        const lastSubcategory = await client_1.prisma.subcategory.findFirst({
            orderBy: { created_at: 'desc' },
            select: { code: true },
        });
        const newCode = lastSubcategory
            ? (parseInt(lastSubcategory.code) + 1).toString()
            : '1000';
        // First create without code
        const subcategory = await client_1.prisma.subcategory.create({
            data: {
                ...data,
                code: newCode, // Temporary empty value
            },
        });
        return subcategory;
    }
    async getSubcategoryById(id) {
        const subcategory = await client_1.prisma.subcategory.findUnique({
            where: { id },
            include: {
                products: {
                    where: { is_active: true },
                    select: { id: true, name: true },
                },
            },
        });
        if (!subcategory) {
            throw new apiError_1.AppError(404, 'Subcategory not found');
        }
        return subcategory;
    }
    async updateSubcategory(id, data) {
        await this.getSubcategoryById(id); // Verify exists
        return client_1.prisma.subcategory.update({
            where: { id },
            data,
        });
    }
    async toggleSubcategoryStatus(id) {
        const subcategory = await this.getSubcategoryById(id);
        return client_1.prisma.subcategory.update({
            where: { id },
            data: { is_active: !subcategory.is_active },
        });
    }
    async deleteSubcategory(id) {
        const subcategory = await client_1.prisma.subcategory.findUnique({ where: { id } });
        if (!subcategory) {
            throw new apiError_1.AppError(404, 'Subcategory not found');
        }
        await client_1.prisma.$transaction(async (tx) => {
            const defaultSubcategoryId = await catalog_defaults_service_1.catalogDefaults.ensureDefaultSubcategory(tx, id);
            await tx.product.updateMany({
                where: { subcategory_id: id },
                data: { subcategory_id: defaultSubcategoryId },
            });
            await tx.subcategory.delete({ where: { id } });
        }, catalog_defaults_service_1.catalogDeleteOptions);
        return { message: 'Subcategory deleted successfully' };
    }
    async listSubcategories({ page = 1, limit = 10, search, is_active = true, display_on_pos = true, }) {
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
        const [subcategories, total] = await Promise.all([
            client_1.prisma.subcategory.findMany({
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
            client_1.prisma.subcategory.count({ where }),
        ]);
        return {
            data: subcategories.map(s => ({
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
}
exports.SubcategoryService = SubcategoryService;
//# sourceMappingURL=subcategory.service.js.map