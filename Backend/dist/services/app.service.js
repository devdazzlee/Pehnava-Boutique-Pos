"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const category_service_1 = require("./category.service");
const product_service_1 = require("./product.service");
const productService = new product_service_1.ProductService();
const categoryService = new category_service_1.CategoryService();
class AppService {
    productService;
    categoryService;
    constructor() {
        this.productService = productService;
        this.categoryService = categoryService;
    }
    async getHomeData() {
        const [featuredProducts, bestSellingProducts, categories] = await Promise.all([
            this.productService.getFeaturedProducts(),
            this.productService.getBestSellingProducts(),
            this.categoryService.getCategories(),
        ]);
        return {
            featuredProducts,
            bestSellingProducts,
            categories,
        };
    }
    ;
    async searchProducts(query, limit) {
        const products = await this.productService.getProductByNameSearch(query, limit);
        return products;
    }
    async getProductById(id) {
        const product = await this.productService.getProductById(id);
        return product;
    }
    async getCategories() {
        return this.categoryService.getCategories();
    }
}
exports.default = AppService;
//# sourceMappingURL=app.service.js.map