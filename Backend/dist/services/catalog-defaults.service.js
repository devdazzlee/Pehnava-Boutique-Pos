"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catalogDeleteOptions = exports.catalogDefaults = void 0;
const DEFAULT_SUPPLIER_NAME = 'General Supplier';
const DEFAULT_CATEGORY_NAME = 'General';
const DEFAULT_CATEGORY_SLUG = 'general';
const DEFAULT_GENERIC_NAME = 'General';
async function maxNumericCodeFromRows(codes) {
    let max = 999;
    for (const row of codes) {
        const parsed = parseInt(row.code, 10);
        if (Number.isFinite(parsed) && parsed > max) {
            max = parsed;
        }
    }
    return (max + 1).toString();
}
async function generateSupplierCode(tx) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const candidates = ['SUP-DEFAULT'];
    for (let i = 0; i < 5; i++) {
        let suffix = '';
        for (let j = 0; j < 6; j++) {
            suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
        }
        candidates.push(`SUP-${suffix}`);
    }
    for (const code of candidates) {
        const clash = await tx.supplier.findUnique({ where: { code } });
        if (!clash)
            return code;
    }
    return `SUP-${Date.now()}`;
}
exports.catalogDefaults = {
    async ensureDefaultSupplier(tx, excludeId) {
        const existing = await tx.supplier.findFirst({
            where: {
                name: { equals: DEFAULT_SUPPLIER_NAME, mode: 'insensitive' },
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        });
        if (existing)
            return existing.id;
        const created = await tx.supplier.create({
            data: {
                name: DEFAULT_SUPPLIER_NAME,
                code: await generateSupplierCode(tx),
                status: 'active',
                is_active: true,
                display_on_pos: false,
            },
        });
        return created.id;
    },
    async ensureDefaultCategory(tx, excludeId) {
        const existing = await tx.category.findFirst({
            where: {
                OR: [
                    { slug: DEFAULT_CATEGORY_SLUG },
                    { name: { equals: DEFAULT_CATEGORY_NAME, mode: 'insensitive' } },
                ],
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        });
        if (existing)
            return existing.id;
        const created = await tx.category.create({
            data: {
                name: DEFAULT_CATEGORY_NAME,
                slug: DEFAULT_CATEGORY_SLUG,
                code: await maxNumericCodeFromRows(await tx.category.findMany({ select: { code: true } })),
                display_on_branches: [],
                is_active: true,
                display_on_pos: false,
            },
        });
        return created.id;
    },
    async ensureDefaultSubcategory(tx, excludeId) {
        const existing = await tx.subcategory.findFirst({
            where: {
                name: { equals: DEFAULT_GENERIC_NAME, mode: 'insensitive' },
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        });
        if (existing)
            return existing.id;
        const created = await tx.subcategory.create({
            data: {
                name: DEFAULT_GENERIC_NAME,
                code: await maxNumericCodeFromRows(await tx.subcategory.findMany({ select: { code: true } })),
                is_active: true,
                display_on_pos: false,
            },
        });
        return created.id;
    },
    async ensureDefaultUnit(tx, excludeId) {
        const existing = await tx.unit.findFirst({
            where: {
                name: { equals: DEFAULT_GENERIC_NAME, mode: 'insensitive' },
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        });
        if (existing)
            return existing.id;
        const created = await tx.unit.create({
            data: {
                name: DEFAULT_GENERIC_NAME,
                code: await maxNumericCodeFromRows(await tx.unit.findMany({ select: { code: true } })),
                is_active: true,
                display_on_pos: false,
            },
        });
        return created.id;
    },
    async ensureDefaultBrand(tx, excludeId) {
        const existing = await tx.brand.findFirst({
            where: {
                name: { equals: DEFAULT_GENERIC_NAME, mode: 'insensitive' },
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        });
        if (existing)
            return existing.id;
        const created = await tx.brand.create({
            data: {
                name: DEFAULT_GENERIC_NAME,
                code: await maxNumericCodeFromRows(await tx.brand.findMany({ select: { code: true } })),
                is_active: true,
                display_on_pos: false,
            },
        });
        return created.id;
    },
    async ensureDefaultColor(tx, excludeId) {
        const existing = await tx.color.findFirst({
            where: {
                name: { equals: DEFAULT_GENERIC_NAME, mode: 'insensitive' },
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        });
        if (existing)
            return existing.id;
        const created = await tx.color.create({
            data: {
                name: DEFAULT_GENERIC_NAME,
                code: await maxNumericCodeFromRows(await tx.color.findMany({ select: { code: true } })),
                is_active: true,
                display_on_pos: false,
            },
        });
        return created.id;
    },
    async ensureDefaultSize(tx, excludeId) {
        const existing = await tx.size.findFirst({
            where: {
                name: { equals: DEFAULT_GENERIC_NAME, mode: 'insensitive' },
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        });
        if (existing)
            return existing.id;
        const created = await tx.size.create({
            data: {
                name: DEFAULT_GENERIC_NAME,
                code: await maxNumericCodeFromRows(await tx.size.findMany({ select: { code: true } })),
                is_active: true,
                display_on_pos: false,
            },
        });
        return created.id;
    },
};
exports.catalogDeleteOptions = {
    maxWait: 30000,
    timeout: 120000,
};
//# sourceMappingURL=catalog-defaults.service.js.map