"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const app_1 = require("./config/app");
const client_1 = require("./prisma/client");
const error_middleware_1 = require("./middleware/error.middleware");
const not_found_middleware_1 = require("./middleware/not-found.middleware");
const db_1 = require("./config/db");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const category_routes_1 = __importDefault(require("./routes/category.routes"));
const subcategory_routes_1 = __importDefault(require("./routes/subcategory.routes"));
const branch_routes_1 = __importDefault(require("./routes/branch.routes"));
const color_routes_1 = __importDefault(require("./routes/color.routes"));
const size_routes_1 = __importDefault(require("./routes/size.routes"));
const unit_routes_1 = __importDefault(require("./routes/unit.routes"));
const supplier_routes_1 = __importDefault(require("./routes/supplier.routes"));
const tax_routes_1 = __importDefault(require("./routes/tax.routes"));
const brand_routes_1 = __importDefault(require("./routes/brand.routes"));
const product_routes_1 = __importDefault(require("./routes/product.routes"));
const adminOrder_routes_1 = __importDefault(require("./routes/adminOrder.routes"));
const stock_routes_1 = __importDefault(require("./routes/stock.routes"));
const purchase_routes_1 = __importDefault(require("./routes/purchase.routes"));
const purchaseOrder_routes_1 = __importDefault(require("./routes/purchaseOrder.routes"));
const purchaseReturn_routes_1 = __importDefault(require("./routes/purchaseReturn.routes"));
const purchaseInvoice_routes_1 = __importDefault(require("./routes/purchaseInvoice.routes"));
const transfer_routes_1 = __importDefault(require("./routes/transfer.routes"));
const stock_out_routes_1 = __importDefault(require("./routes/stock-out.routes"));
const stock_adjustment_routes_1 = __importDefault(require("./routes/stock-adjustment.routes"));
const inventory_routes_1 = __importDefault(require("./routes/inventory.routes"));
const sale_routes_1 = __importDefault(require("./routes/sale.routes"));
const app_routes_1 = __importDefault(require("./routes/app.routes"));
const expense_routes_1 = __importDefault(require("./routes/expense.routes"));
const cashflow_routes_1 = __importDefault(require("./routes/cashflow.routes"));
const register_report_routes_1 = __importDefault(require("./routes/register-report.routes"));
const purchase_report_routes_1 = __importDefault(require("./routes/purchase-report.routes"));
const sales_report_routes_1 = __importDefault(require("./routes/sales-report.routes"));
const till_routes_1 = __importDefault(require("./routes/till.routes"));
const financial_statement_routes_1 = __importDefault(require("./routes/financial-statement.routes"));
const profit_loss_routes_1 = __importDefault(require("./routes/profit-loss.routes"));
const balance_sheet_routes_1 = __importDefault(require("./routes/balance-sheet.routes"));
const trial_balance_routes_1 = __importDefault(require("./routes/trial-balance.routes"));
const chart_of_accounts_routes_1 = __importDefault(require("./routes/chart-of-accounts.routes"));
const payroll_routes_1 = __importDefault(require("./routes/payroll.routes"));
const security_routes_1 = require("./routes/security.routes");
const audit_middleware_1 = require("./middleware/audit.middleware");
const stock_quantity_report_routes_1 = __importDefault(require("./routes/stock-quantity-report.routes"));
const product_sales_profit_routes_1 = __importDefault(require("./routes/product-sales-profit.routes"));
const commission_routes_1 = __importDefault(require("./routes/commission.routes"));
const customer_routes_1 = __importDefault(require("./routes/customer.routes"));
const customerOrder_routes_1 = __importDefault(require("./routes/customerOrder.routes"));
const device_identity_routes_1 = __importDefault(require("./routes/device_identity.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const reports_routes_1 = __importDefault(require("./routes/reports.routes"));
const employee_route_1 = __importDefault(require("./routes/employee.route"));
const salary_route_1 = __importDefault(require("./routes/salary.route"));
const shift_route_1 = __importDefault(require("./routes/shift.route"));
const shiftAssignment_routes_1 = __importDefault(require("./routes/shiftAssignment.routes"));
const barcode_routes_1 = __importDefault(require("./routes/barcode.routes"));
const guestOrder_routes_1 = __importDefault(require("./routes/guestOrder.routes"));
const web_routes_1 = __importDefault(require("./routes/web.routes"));
const alfalah_routes_1 = __importDefault(require("./routes/alfalah.routes"));
const node_cron_1 = __importDefault(require("node-cron"));
const localImageService_1 = require("./services/common/localImageService");
const vAPI = process.env.vAPI || '/api/v1';
const app = (0, express_1.default)();
// Locally stored images (IMAGE_STORAGE=local). On the VPS nginx serves these directly.
app.use('/uploads', express_1.default.static(localImageService_1.UPLOADS_DIR, {
    maxAge: '30d',
    setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
}));
// Middleware — CORS must run before route handlers and cache headers.
app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin)
            return callback(null, true);
        const allowedOrigins = [
            'https://pos.manpasandstore.com',
            'https://manpasand-pos-t623.vercel.app',
            'https://manpasand-pos-beta.vercel.app',
            'https://pehnava-boutique-pos.vercel.app',
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:5173',
            'https://manpasandstore.com',
            'https://www.manpasandstore.com',
            // Extra origins (e.g. VPS addresses), comma-separated in .env
            ...(process.env.CORS_ORIGINS || '')
                .split(',')
                .map((o) => o.trim())
                .filter(Boolean),
        ];
        const originMatch = allowedOrigins.some((allowed) => origin === allowed || origin === `${allowed}/`);
        // In local dev, allow any localhost port (Next.js may use 3000, 3001, etc.)
        const isLocalDev = process.env.NODE_ENV !== 'production' &&
            /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        const isTunnelDev = process.env.NODE_ENV !== 'production' &&
            /^https:\/\/([a-z0-9-]+\.(ngrok-free\.app|ngrok-free\.dev|ngrok\.io|ngrok\.app|trycloudflare\.com|loca\.lt))$/i.test(origin);
        if (originMatch || isLocalDev || isTunnelDev) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Cache-Control',
        'Pragma',
        'X-Approver-Email',
        'X-Approver-Password',
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
}));
// Disable ETag + set no-store on API responses (prevents stale 304 product lists).
app.set('etag', false);
app.use(`${vAPI}`, (_req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});
(0, db_1.connectDB)();
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json({ limit: '50mb' })); // Allow large base64 image payloads
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// Audit trail for every successful create / update / delete call
app.use((0, audit_middleware_1.auditTrail)(vAPI));
// Routes
app.use(`${vAPI}/auth`, auth_routes_1.default);
app.use(`${vAPI}/categories`, category_routes_1.default);
app.use(`${vAPI}/subcategories`, subcategory_routes_1.default);
app.use(`${vAPI}/branches`, branch_routes_1.default);
app.use(`${vAPI}/colors`, color_routes_1.default);
app.use(`${vAPI}/sizes`, size_routes_1.default);
app.use(`${vAPI}/units`, unit_routes_1.default);
app.use(`${vAPI}/suppliers`, supplier_routes_1.default);
app.use(`${vAPI}/taxes`, tax_routes_1.default);
app.use(`${vAPI}/brands`, brand_routes_1.default);
app.use(`${vAPI}/products`, product_routes_1.default);
app.use(`${vAPI}/order`, adminOrder_routes_1.default);
app.use(`${vAPI}/sale`, sale_routes_1.default);
app.use(`${vAPI}/stock`, stock_routes_1.default);
app.use(`${vAPI}/purchases`, purchase_routes_1.default);
app.use(`${vAPI}/purchase-orders`, purchaseOrder_routes_1.default);
app.use(`${vAPI}/purchase-returns`, purchaseReturn_routes_1.default);
app.use(`${vAPI}/purchase-invoices`, purchaseInvoice_routes_1.default);
app.use(`${vAPI}/transfers`, transfer_routes_1.default);
app.use(`${vAPI}/stock-out`, stock_out_routes_1.default);
app.use(`${vAPI}/stock-adjustments`, stock_adjustment_routes_1.default);
app.use(`${vAPI}/inventory`, inventory_routes_1.default);
app.use(`${vAPI}/expenses`, expense_routes_1.default);
app.use(`${vAPI}/cashflows`, cashflow_routes_1.default);
app.use(`${vAPI}/register-report`, register_report_routes_1.default);
app.use(`${vAPI}/purchase-report`, purchase_report_routes_1.default);
app.use(`${vAPI}/sales-report`, sales_report_routes_1.default);
app.use(`${vAPI}/till`, till_routes_1.default);
app.use(`${vAPI}/financial-statement`, financial_statement_routes_1.default);
app.use(`${vAPI}/profit-loss`, profit_loss_routes_1.default);
app.use(`${vAPI}/balance-sheet`, balance_sheet_routes_1.default);
app.use(`${vAPI}/trial-balance`, trial_balance_routes_1.default);
app.use(`${vAPI}/chart-of-accounts`, chart_of_accounts_routes_1.default);
app.use(`${vAPI}/payroll`, payroll_routes_1.default);
app.use(`${vAPI}/users`, security_routes_1.usersRouter);
app.use(`${vAPI}/permissions`, security_routes_1.permissionsRouter);
app.use(`${vAPI}/audit`, security_routes_1.auditRouter);
app.use(`${vAPI}/stock-quantity-report`, stock_quantity_report_routes_1.default);
app.use(`${vAPI}/product-sales-profit`, product_sales_profit_routes_1.default);
app.use(`${vAPI}/dashboard`, dashboard_routes_1.default);
app.use(`${vAPI}/reports`, reports_routes_1.default);
app.use(`${vAPI}/employee`, employee_route_1.default);
app.use(`${vAPI}/salaries`, salary_route_1.default);
app.use(`${vAPI}/commissions`, commission_routes_1.default);
app.use(`${vAPI}/shifts`, shift_route_1.default);
app.use(`${vAPI}/shift-assignment`, shiftAssignment_routes_1.default);
app.use(`${vAPI}/barcode-generator`, barcode_routes_1.default);
// Website Routes (paginated, server-side filtered)
app.use(`${vAPI}/web`, web_routes_1.default);
// App Routes
app.use(`${vAPI}/customer/app`, app_routes_1.default);
app.use(`${vAPI}/customer`, customer_routes_1.default);
app.use(`${vAPI}/app/customer/order`, customerOrder_routes_1.default);
app.use(`${vAPI}/customer/device-identity`, device_identity_routes_1.default);
app.use(`${vAPI}/guest/order`, guestOrder_routes_1.default); // Guest checkout route
app.use(`${vAPI}/payments/alfalah`, alfalah_routes_1.default);
// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK - Server is working fine' });
});
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'OK',
        service: 'Pehnava Boutique POS API',
        health: '/health',
        api: vAPI,
    });
});
// Error handling
app.use(error_middleware_1.errorHandler);
app.use(not_found_middleware_1.notFoundHandler);
// Cron job to close drawers after 24 hours — skip on Vercel serverless
if (!process.env.VERCEL) {
    node_cron_1.default.schedule('0 * * * *', async () => {
        const now = new Date();
        console.log("🕐 Cron job running at:", now.toISOString());
        const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        console.log("📅 Looking for drawers opened before:", cutoff.toISOString());
        const openDrawers = await client_1.prisma.cashFlow.findMany({
            where: {
                status: 'OPEN',
                opened_at: { lte: cutoff },
            },
            include: {
                branch: {
                    select: { name: true }
                }
            }
        });
        console.log(`🔍 Found ${openDrawers.length} drawers to auto-close`);
        for (const drawer of openDrawers) {
            await client_1.prisma.cashFlow.update({
                where: { id: drawer.id },
                data: { status: 'CLOSED', closed_at: new Date() },
            });
            console.log(`✅ Auto-closed drawer ${drawer.id} for branch: ${drawer.branch?.name || 'Unknown'}`);
        }
        if (openDrawers.length === 0) {
            console.log("✅ No drawers needed auto-closing");
        }
    });
}
// Start server only when not running on Vercel serverless
if (!process.env.VERCEL) {
    app.listen(app_1.config.port, () => {
        console.log(`Server running on port ${app_1.config.port}`);
    });
}
process.on('SIGINT', async () => {
    await client_1.prisma.$disconnect();
    process.exit(0);
});
exports.default = app;
//# sourceMappingURL=index.js.map