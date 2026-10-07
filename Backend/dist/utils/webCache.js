"use strict";
// In-memory TTL cache for public website API responses.
// Redis was removed from the project; this lightweight layer prevents every
// page view from hammering Postgres with identical heavy queries.
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEB_CACHE_PREFIXES = exports.WEB_CACHE_TTL = void 0;
exports.getCache = getCache;
exports.setCache = setCache;
exports.withCache = withCache;
exports.invalidateCache = invalidateCache;
exports.invalidatePattern = invalidatePattern;
exports.invalidateWebCatalogCache = invalidateWebCatalogCache;
const store = new Map();
const MAX_ENTRIES = 500;
function pruneIfNeeded() {
    if (store.size <= MAX_ENTRIES)
        return;
    const now = Date.now();
    for (const [key, entry] of store) {
        if (entry.expiresAt <= now)
            store.delete(key);
        if (store.size <= MAX_ENTRIES * 0.8)
            break;
    }
    if (store.size > MAX_ENTRIES) {
        const oldest = [...store.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
        for (let i = 0; i < oldest.length - MAX_ENTRIES * 0.8; i++) {
            store.delete(oldest[i][0]);
        }
    }
}
async function getCache(key) {
    const hit = store.get(key);
    if (!hit)
        return null;
    if (Date.now() >= hit.expiresAt) {
        store.delete(key);
        return null;
    }
    return hit.value;
}
async function setCache(key, value, ttlSeconds) {
    if (ttlSeconds <= 0)
        return;
    pruneIfNeeded();
    store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}
async function withCache(key, ttlSeconds, loader) {
    if (ttlSeconds > 0) {
        const cached = await getCache(key);
        if (cached !== null)
            return cached;
    }
    const value = await loader();
    await setCache(key, value, ttlSeconds);
    return value;
}
async function invalidateCache(keys) {
    for (const key of keys)
        store.delete(key);
}
async function invalidatePattern(pattern) {
    const prefix = pattern.replace(/\*$/, '');
    for (const key of store.keys()) {
        if (key.startsWith(prefix))
            store.delete(key);
    }
}
exports.WEB_CACHE_TTL = {
    HOME: 5 * 60,
    CATEGORIES_LIST: 10 * 60,
    CATEGORY_DETAIL: 5 * 60,
    PRODUCT_LIST: 3 * 60,
    PRODUCT_DETAIL: 5 * 60,
    SEARCH_SUGGEST: 2 * 60,
    PRODUCT_COUNT: 10 * 60,
};
/**
 * Key prefixes written by web.service.ts. Invalidation must use these exact
 * prefixes so POS catalog edits show up on the public website.
 */
exports.WEB_CACHE_PREFIXES = {
    HOME: 'home:',
    CATEGORIES_LIST: 'categories:',
    CATEGORY_DETAIL: 'category:',
    PRODUCT_LIST: 'products:',
    PRODUCT_DETAIL: 'product:',
    SEARCH_SUGGEST: 'suggest:',
    PRODUCT_COUNT: 'meta:',
};
async function invalidateWebCatalogCache() {
    await Promise.all(Object.values(exports.WEB_CACHE_PREFIXES).map((prefix) => invalidatePattern(prefix)));
}
//# sourceMappingURL=webCache.js.map