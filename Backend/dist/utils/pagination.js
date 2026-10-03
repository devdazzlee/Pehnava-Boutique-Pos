"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_LIMIT = exports.DEFAULT_LIMIT = exports.DEFAULT_PAGE = void 0;
exports.parsePagination = parsePagination;
exports.paginationMeta = paginationMeta;
/** Default page size for list APIs. Keep small so catalogs can grow. */
exports.DEFAULT_PAGE = 1;
exports.DEFAULT_LIMIT = 20;
exports.MAX_LIMIT = 100;
function parsePagination(input) {
    const pageNum = Number(input.page);
    const limitNum = Number(input.limit);
    const page = Number.isFinite(pageNum) && pageNum > 0 ? Math.floor(pageNum) : exports.DEFAULT_PAGE;
    const rawLimit = Number.isFinite(limitNum) && limitNum > 0 ? Math.floor(limitNum) : exports.DEFAULT_LIMIT;
    const limit = Math.min(exports.MAX_LIMIT, Math.max(1, rawLimit));
    return { page, limit, skip: (page - 1) * limit };
}
function paginationMeta(total, page, limit) {
    return {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / Math.max(limit, 1)) || 1),
    };
}
//# sourceMappingURL=pagination.js.map