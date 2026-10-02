"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const web_controller_1 = require("../controllers/web.controller");
const router = (0, express_1.Router)();
// Home — single bundled payload for the website landing page
router.get('/home', web_controller_1.getHome);
// Categories
router.get('/categories', web_controller_1.listCategories);
router.get('/categories/all', web_controller_1.getAllCategories);
router.get('/categories/:slug', web_controller_1.getCategoryBySlug);
// Products
router.get('/products', web_controller_1.listProducts);
router.get('/products/:id', web_controller_1.getProductById);
// Search suggestions (typeahead)
router.get('/search/suggest', web_controller_1.suggestProducts);
// Meta
router.get('/meta/product-count', web_controller_1.getProductCount);
exports.default = router;
//# sourceMappingURL=web.routes.js.map