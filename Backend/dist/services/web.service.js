"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const webCache_1 = require("../utils/webCache");
const date_fns_1 = require("date-fns");
const SORT_MAP = {
    newest: { created_at: 'desc' },
    oldest: { created_at: 'asc' },
    'price-asc': { sales_rate_inc_dis_and_tax: 'asc' },
    'price-desc': { sales_rate_inc_dis_and_tax: 'desc' },
    'name-asc': { name: 'asc' },
    'name-desc': { name: 'desc' },
};
const PRODUCT_CARD_SELECT = {
    id: true,
    name: true,
    code: true,
    sku: true,
    description: true,
    sales_rate_exc_dis_and_tax: true,
    sales_rate_inc_dis_and_tax: true,
    discount_amount: true,
    is_featured: true,
    is_active: true,
    display_on_website: true,
    category_id: true,
    created_at: true,
    category: { select: { id: true, name: true, slug: true } },
    unit: { select: { id: true, name: true } },
    ProductImage: {
        where: { status: 'COMPLETE' },
        select: { image: true },
        take: 1,
    },
};
const CATEGORY_CARD_SELECT = {
    id: true,
    name: true,
    slug: true,
    code: true,
    is_active: true,
    CategoryImages: {
        where: { status: 'COMPLETE' },
        select: { image: true },
        take: 1,
    },
    _count: { select: { products: { where: { is_active: true, display_on_website: true } } } },
};
function shapeProduct(p) {
    const image = p.ProductImage?.[0]?.image ?? null;
    return {
        id: p.id,
        name: p.name,
        code: p.code,
        sku: p.sku,
        description: p.description,
        price: p.sales_rate_inc_dis_and_tax,
        base_price: p.sales_rate_exc_dis_and_tax,
        discount_amount: p.discount_amount,
        is_featured: p.is_featured,
        is_active: p.is_active,
        category_id: p.category_id,
        category: p.category,
        unit: p.unit,
        image,
        images: p.ProductImage?.map((i) => i.image) ?? [],
        created_at: p.created_at,
    };
}
function shapeCategory(c) {
    const image = c.CategoryImages?.[0]?.image ?? null;
    return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        code: c.code,
        is_active: c.is_active,
        image,
        product_count: c._count.products,
    };
}
function clampLimit(value, fallback, max = 100) {
    const n = typeof value === 'string' ? parseInt(value, 10) : value;
    if (!Number.isFinite(n) || n <= 0)
        return fallback;
    return Math.min(n, max);
}
function clampPage(value) {
    const n = typeof value === 'string' ? parseInt(value, 10) : value;
    if (!Number.isFinite(n) || n <= 0)
        return 1;
    return n;
}
class WebService {
    async getHome(opts = {}) {
        const featuredLimit = clampLimit(opts.featuredLimit, 8, 24);
        // bestLimit defaults to 0 — homepage does not render best sellers; skip the heavy join.
        const bestLimit = opts.bestLimit === 0 ? 0 : clampLimit(opts.bestLimit ?? 0, 0, 24);
        const categoriesLimit = clampLimit(opts.categoriesLimit, 24, 50);
        const cacheKey = `${webCache_1.WEB_CACHE_PREFIXES.HOME}v5:f${featuredLimit}:b${bestLimit}:c${categoriesLimit}`;
        return (0, webCache_1.withCache)(cacheKey, webCache_1.WEB_CACHE_TTL.HOME, async () => {
            const [featured, bestSellers, categories, productCount, featuredTotal, categoriesTotal] = await Promise.all([
                this.loadFeatured(featuredLimit),
                bestLimit > 0 ? this.loadBestSellers(bestLimit) : Promise.resolve([]),
                this.loadHomeCategories(categoriesLimit),
                client_1.prisma.product.count({ where: { is_active: true, display_on_website: true } }),
                client_1.prisma.product.count({ where: { is_active: true, display_on_website: true, is_featured: true } }),
                client_1.prisma.category.count({ where: { is_active: true } }),
            ]);
            return {
                featuredProducts: featured,
                bestSellingProducts: bestSellers,
                categories,
                product_count: productCount,
                featured_total: featuredTotal,
                categories_total: categoriesTotal,
            };
        });
    }
    async loadFeatured(limit) {
        const featured = await client_1.prisma.product.findMany({
            where: { is_featured: true, is_active: true, display_on_website: true },
            orderBy: { created_at: 'desc' },
            take: limit,
            select: PRODUCT_CARD_SELECT,
        });
        if (featured.length >= limit)
            return featured.map(shapeProduct);
        const need = limit - featured.length;
        const excludeIds = featured.map((p) => p.id);
        const fillers = await client_1.prisma.product.findMany({
            where: {
                is_active: true,
                display_on_website: true,
                id: excludeIds.length ? { notIn: excludeIds } : undefined,
            },
            orderBy: { created_at: 'desc' },
            take: need,
            select: PRODUCT_CARD_SELECT,
        });
        return [...featured, ...fillers].map(shapeProduct);
    }
    async loadBestSellers(limit) {
        const startDate = (0, date_fns_1.startOfMonth)(new Date());
        const endDate = new Date();
        const bestSellers = await client_1.prisma.product.findMany({
            where: {
                is_active: true,
                display_on_website: true,
                order_items: { some: { created_at: { gte: startDate, lte: endDate } } },
            },
            orderBy: { order_items: { _count: 'desc' } },
            take: limit,
            select: PRODUCT_CARD_SELECT,
        });
        if (bestSellers.length >= limit)
            return bestSellers.map(shapeProduct);
        const need = limit - bestSellers.length;
        const excludeIds = bestSellers.map((p) => p.id);
        const fillers = await client_1.prisma.product.findMany({
            where: {
                is_active: true,
                display_on_website: true,
                id: excludeIds.length ? { notIn: excludeIds } : undefined,
            },
            orderBy: { created_at: 'desc' },
            take: need,
            select: PRODUCT_CARD_SELECT,
        });
        return [...bestSellers, ...fillers].map(shapeProduct);
    }
    async loadHomeCategories(limit) {
        const categories = await client_1.prisma.category.findMany({
            where: { is_active: true },
            orderBy: { name: 'asc' },
            take: limit,
            select: CATEGORY_CARD_SELECT,
        });
        return categories.map(shapeCategory);
    }
    async listCategories(opts) {
        const all = !!opts.all;
        const limit = all ? 200 : clampLimit(opts.limit, 12, 50);
        const page = clampPage(opts.page);
        const search = (opts.search ?? '').trim();
        const cacheKey = all
            ? `${webCache_1.WEB_CACHE_PREFIXES.CATEGORIES_LIST}v2:all`
            : `${webCache_1.WEB_CACHE_PREFIXES.CATEGORIES_LIST}v2:p${page}:l${limit}:q${search.toLowerCase()}`;
        return (0, webCache_1.withCache)(cacheKey, webCache_1.WEB_CACHE_TTL.CATEGORIES_LIST, async () => {
            const where = { is_active: true };
            if (search) {
                where.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { slug: { contains: search, mode: 'insensitive' } },
                ];
            }
            const [rows, total] = await Promise.all([
                client_1.prisma.category.findMany({
                    where,
                    orderBy: { name: 'asc' },
                    skip: all ? undefined : (page - 1) * limit,
                    take: all ? undefined : limit,
                    select: CATEGORY_CARD_SELECT,
                }),
                client_1.prisma.category.count({ where }),
            ]);
            return {
                data: rows.map(shapeCategory),
                meta: {
                    total,
                    page: all ? 1 : page,
                    limit: all ? total : limit,
                    totalPages: all ? 1 : Math.max(1, Math.ceil(total / limit)),
                },
            };
        });
    }
    async getCategoryBySlug(slug, opts) {
        const trimmed = slug?.trim();
        if (!trimmed)
            throw new apiError_1.AppError(400, 'Category slug is required');
        const limit = clampLimit(opts.limit, 12, 48);
        const page = clampPage(opts.page);
        const sort = opts.sort && SORT_MAP[opts.sort] ? opts.sort : 'newest';
        const cacheKey = `${webCache_1.WEB_CACHE_PREFIXES.CATEGORY_DETAIL}${trimmed}:p${page}:l${limit}:s${sort}`;
        return (0, webCache_1.withCache)(cacheKey, webCache_1.WEB_CACHE_TTL.CATEGORY_DETAIL, async () => {
            const category = await client_1.prisma.category.findUnique({
                where: { slug: trimmed },
                select: CATEGORY_CARD_SELECT,
            });
            if (!category || !category.is_active) {
                throw new apiError_1.AppError(404, 'Category not found');
            }
            const productsWhere = {
                category_id: category.id,
                is_active: true,
                display_on_website: true,
            };
            const [products, total] = await Promise.all([
                client_1.prisma.product.findMany({
                    where: productsWhere,
                    orderBy: SORT_MAP[sort],
                    skip: (page - 1) * limit,
                    take: limit,
                    select: PRODUCT_CARD_SELECT,
                }),
                client_1.prisma.product.count({ where: productsWhere }),
            ]);
            return {
                category: shapeCategory(category),
                products: products.map(shapeProduct),
                meta: {
                    total,
                    page,
                    limit,
                    totalPages: Math.max(1, Math.ceil(total / limit)),
                    sort,
                },
            };
        });
    }
    async listProducts(opts) {
        const limit = clampLimit(opts.limit, 12, 48);
        const page = clampPage(opts.page);
        const sort = opts.sort && SORT_MAP[opts.sort] ? opts.sort : 'newest';
        const search = (opts.search ?? '').trim();
        const where = { is_active: true, display_on_website: true };
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (opts.featured)
            where.is_featured = true;
        if (opts.category_id) {
            where.category_id = opts.category_id;
        }
        else if (opts.category_slug) {
            where.category = { slug: opts.category_slug };
        }
        if (opts.subcategory_id)
            where.subcategory_id = opts.subcategory_id;
        const min = typeof opts.min_price === 'number' && Number.isFinite(opts.min_price) ? opts.min_price : undefined;
        const max = typeof opts.max_price === 'number' && Number.isFinite(opts.max_price) ? opts.max_price : undefined;
        if (min !== undefined || max !== undefined) {
            where.sales_rate_inc_dis_and_tax = {
                ...(min !== undefined ? { gte: min } : {}),
                ...(max !== undefined ? { lte: max } : {}),
            };
        }
        const cacheKey = `${webCache_1.WEB_CACHE_PREFIXES.PRODUCT_LIST}p${page}:l${limit}:s${sort}:q${search.toLowerCase()}:c${opts.category_id ?? opts.category_slug ?? ''}:sc${opts.subcategory_id ?? ''}:min${min ?? ''}:max${max ?? ''}:f${opts.featured ? 1 : 0}`;
        return (0, webCache_1.withCache)(cacheKey, webCache_1.WEB_CACHE_TTL.PRODUCT_LIST, async () => {
            const [rows, total] = await Promise.all([
                client_1.prisma.product.findMany({
                    where,
                    orderBy: SORT_MAP[sort],
                    skip: (page - 1) * limit,
                    take: limit,
                    select: PRODUCT_CARD_SELECT,
                }),
                client_1.prisma.product.count({ where }),
            ]);
            return {
                data: rows.map(shapeProduct),
                meta: {
                    total,
                    page,
                    limit,
                    totalPages: Math.max(1, Math.ceil(total / limit)),
                    sort,
                },
            };
        });
    }
    async getProductById(id) {
        const trimmed = id?.trim();
        if (!trimmed)
            throw new apiError_1.AppError(400, 'Product id is required');
        return (0, webCache_1.withCache)(`${webCache_1.WEB_CACHE_PREFIXES.PRODUCT_DETAIL}${trimmed}`, webCache_1.WEB_CACHE_TTL.PRODUCT_DETAIL, async () => {
            const product = await client_1.prisma.product.findUnique({
                where: { id: trimmed },
                select: {
                    ...PRODUCT_CARD_SELECT,
                    ProductImage: {
                        where: { status: 'COMPLETE' },
                        select: { image: true },
                    },
                    tax: { select: { id: true, name: true, percentage: true } },
                    brand: { select: { id: true, name: true } },
                    subcategory: { select: { id: true, name: true } },
                    stock: { select: { current_quantity: true, reserved_quantity: true } },
                },
            });
            if (!product || !product.is_active || product.display_on_website === false) {
                throw new apiError_1.AppError(404, 'Product not found');
            }
            const totalStock = (product.stock ?? []).reduce((sum, s) => sum + Number(s.current_quantity ?? 0) - Number(s.reserved_quantity ?? 0), 0);
            const shaped = shapeProduct(product);
            return {
                ...shaped,
                images: product.ProductImage?.map((i) => i.image) ?? [],
                tax: product.tax,
                brand: product.brand,
                subcategory: product.subcategory,
                in_stock: totalStock > 0,
                available_stock: totalStock,
            };
        });
    }
    async suggestProducts(query, limit = 8) {
        const trimmed = query?.trim();
        if (!trimmed || trimmed.length < 2)
            return [];
        const safeLimit = clampLimit(limit, 8, 20);
        const cacheKey = `${webCache_1.WEB_CACHE_PREFIXES.SEARCH_SUGGEST}${trimmed.toLowerCase()}:l${safeLimit}`;
        return (0, webCache_1.withCache)(cacheKey, webCache_1.WEB_CACHE_TTL.SEARCH_SUGGEST, async () => {
            const rows = await client_1.prisma.product.findMany({
                where: {
                    is_active: true,
                    display_on_website: true,
                    OR: [
                        { name: { contains: trimmed, mode: 'insensitive' } },
                        { sku: { contains: trimmed, mode: 'insensitive' } },
                    ],
                },
                orderBy: { created_at: 'desc' },
                take: safeLimit,
                select: {
                    id: true,
                    name: true,
                    sales_rate_inc_dis_and_tax: true,
                    category: { select: { id: true, name: true, slug: true } },
                    ProductImage: {
                        where: { status: 'COMPLETE' },
                        select: { image: true },
                        take: 1,
                    },
                },
            });
            return rows.map((p) => ({
                id: p.id,
                name: p.name,
                price: p.sales_rate_inc_dis_and_tax,
                category: p.category,
                image: p.ProductImage?.[0]?.image ?? null,
            }));
        });
    }
    async getProductCount() {
        return (0, webCache_1.withCache)(`${webCache_1.WEB_CACHE_PREFIXES.PRODUCT_COUNT}product-count`, webCache_1.WEB_CACHE_TTL.PRODUCT_COUNT, async () => {
            const count = await client_1.prisma.product.count({ where: { is_active: true, display_on_website: true } });
            return { count };
        });
    }
}
exports.WebService = WebService;
exports.default = WebService;
//# sourceMappingURL=web.service.js.map