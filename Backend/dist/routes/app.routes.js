"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const app_controller_1 = require("../controllers/app.controller");
const router = (0, express_1.Router)();
router.get("/", app_controller_1.getHomeData);
router.get("/categories", app_controller_1.getCategories);
router.get("/products", app_controller_1.searchProducts);
router.get("/products/:id", app_controller_1.getProductById);
exports.default = router;
//# sourceMappingURL=app.routes.js.map