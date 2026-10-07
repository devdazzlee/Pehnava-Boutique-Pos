import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/app';
import { prisma } from './prisma/client';
import { errorHandler } from './middleware/error.middleware';
import { notFoundHandler } from './middleware/not-found.middleware';
import { connectDB } from './config/db';
import authRoutes from './routes/auth.routes';
import categoryRoutes from './routes/category.routes';
import subcategoryRoutes from './routes/subcategory.routes';
import branchRoutes from './routes/branch.routes';
import colorRoutes from './routes/color.routes';
import sizeRoutes from './routes/size.routes';
import unitRoutes from './routes/unit.routes';
import supplierRoutes from './routes/supplier.routes';
import taxRoutes from './routes/tax.routes';
import brandRoutes from './routes/brand.routes';
import productRoutes  from './routes/product.routes';
import orderRoutes  from './routes/adminOrder.routes';
import stockRoutes  from './routes/stock.routes';
import purchaseRoutes from './routes/purchase.routes';
import purchaseOrderRoutes from './routes/purchaseOrder.routes';
import purchaseReturnRoutes from './routes/purchaseReturn.routes';
import purchaseInvoiceRoutes from './routes/purchaseInvoice.routes';
import transferRoutes from './routes/transfer.routes';
import stockOutRoutes from './routes/stock-out.routes';
import stockAdjustmentRoutes from './routes/stock-adjustment.routes';
import inventoryRoutes from './routes/inventory.routes';
import saleRoutes  from './routes/sale.routes';
import appRoutes  from './routes/app.routes';
import expenseRoutes  from './routes/expense.routes';
import cashflowRoutes  from './routes/cashflow.routes';
import registerReportRoutes from './routes/register-report.routes';
import purchaseReportRoutes from './routes/purchase-report.routes';
import salesReportRoutes from './routes/sales-report.routes';
import tillRoutes from './routes/till.routes';
import cashRegisterRoutes from './routes/cash-register.routes';
import analyticsRoutes from './routes/analytics.routes';
import financeControlsRoutes from './routes/finance-controls.routes';
import { loyaltyRouter, giftCardRouter, promotionRouter, taxToolsRouter } from './routes/commerce.routes';
import financialStatementRoutes from './routes/financial-statement.routes';
import profitLossRoutes from './routes/profit-loss.routes';
import balanceSheetRoutes from './routes/balance-sheet.routes';
import trialBalanceRoutes from './routes/trial-balance.routes';
import chartOfAccountsRoutes from './routes/chart-of-accounts.routes';
import payrollRoutes from './routes/payroll.routes';
import { usersRouter, permissionsRouter, auditRouter } from './routes/security.routes';
import { auditTrail } from './middleware/audit.middleware';
import stockQuantityReportRoutes from './routes/stock-quantity-report.routes';
import productSalesProfitRoutes from './routes/product-sales-profit.routes';
import commissionRoutes from './routes/commission.routes';
import customerRoutes  from './routes/customer.routes';
import customerOrderRoutes  from './routes/customerOrder.routes';
import deviceIdentityRoutes  from './routes/device_identity.routes';
import dashboardRoutes  from './routes/dashboard.routes';
import reportsRoutes  from './routes/reports.routes';
import employeeRoutes  from './routes/employee.route';
import salaryRoutes  from './routes/salary.route';
import shiftRoutes  from './routes/shift.route';
import shiftAssignmentRoutes  from './routes/shiftAssignment.routes';
import barcodeRoutes from './routes/barcode.routes';
import guestOrderRoutes from './routes/guestOrder.routes';
import webRoutes from './routes/web.routes';
import alfalahRoutes from './routes/alfalah.routes';
import cron from 'node-cron';
import { UPLOADS_DIR } from './services/common/localImageService';

const vAPI = process.env.vAPI || '/api/v1';
const app = express();

// Locally stored images (IMAGE_STORAGE=local). On the VPS nginx serves these directly.
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '30d',
  setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
}));

// Middleware — CORS must run before route handlers and cache headers.
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

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

    const originMatch = allowedOrigins.some(
      (allowed) => origin === allowed || origin === `${allowed}/`,
    );

    // In local dev, allow any localhost port (Next.js may use 3000, 3001, etc.)
    const isLocalDev =
      process.env.NODE_ENV !== 'production' &&
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

    const isTunnelDev =
      process.env.NODE_ENV !== 'production' &&
      /^https:\/\/([a-z0-9-]+\.(ngrok-free\.app|ngrok-free\.dev|ngrok\.io|ngrok\.app|trycloudflare\.com|loca\.lt))$/i.test(
        origin,
      );

    if (originMatch || isLocalDev || isTunnelDev) {
      callback(null, true);
    } else {
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

connectDB();
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));  // Allow large base64 image payloads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Audit trail for every successful create / update / delete call
app.use(auditTrail(vAPI));

// Routes
app.use(`${vAPI}/auth`, authRoutes);
app.use(`${vAPI}/categories`, categoryRoutes);
app.use(`${vAPI}/subcategories`, subcategoryRoutes);
app.use(`${vAPI}/branches`, branchRoutes);
app.use(`${vAPI}/colors`, colorRoutes);
app.use(`${vAPI}/sizes`, sizeRoutes);
app.use(`${vAPI}/units`, unitRoutes);
app.use(`${vAPI}/suppliers`, supplierRoutes);
app.use(`${vAPI}/taxes`, taxRoutes);
app.use(`${vAPI}/brands`, brandRoutes);
app.use(`${vAPI}/products`, productRoutes);
app.use(`${vAPI}/order`, orderRoutes);
app.use(`${vAPI}/sale`, saleRoutes);
app.use(`${vAPI}/stock`, stockRoutes);
app.use(`${vAPI}/purchases`, purchaseRoutes);
app.use(`${vAPI}/purchase-orders`, purchaseOrderRoutes);
app.use(`${vAPI}/purchase-returns`, purchaseReturnRoutes);
app.use(`${vAPI}/purchase-invoices`, purchaseInvoiceRoutes);
app.use(`${vAPI}/transfers`, transferRoutes);
app.use(`${vAPI}/stock-out`, stockOutRoutes);
app.use(`${vAPI}/stock-adjustments`, stockAdjustmentRoutes);
app.use(`${vAPI}/inventory`, inventoryRoutes);
app.use(`${vAPI}/expenses`, expenseRoutes);
app.use(`${vAPI}/cashflows`, cashflowRoutes);
app.use(`${vAPI}/register-report`, registerReportRoutes);
app.use(`${vAPI}/purchase-report`, purchaseReportRoutes);
app.use(`${vAPI}/sales-report`, salesReportRoutes);
app.use(`${vAPI}/till`, tillRoutes);
app.use(`${vAPI}/cash-register`, cashRegisterRoutes);
app.use(`${vAPI}/analytics`, analyticsRoutes);
app.use(`${vAPI}/finance`, financeControlsRoutes);
app.use(`${vAPI}/loyalty`, loyaltyRouter);
app.use(`${vAPI}/gift-cards`, giftCardRouter);
app.use(`${vAPI}/promotions`, promotionRouter);
app.use(`${vAPI}/tax-tools`, taxToolsRouter);
app.use(`${vAPI}/financial-statement`, financialStatementRoutes);
app.use(`${vAPI}/profit-loss`, profitLossRoutes);
app.use(`${vAPI}/balance-sheet`, balanceSheetRoutes);
app.use(`${vAPI}/trial-balance`, trialBalanceRoutes);
app.use(`${vAPI}/chart-of-accounts`, chartOfAccountsRoutes);
app.use(`${vAPI}/payroll`, payrollRoutes);
app.use(`${vAPI}/users`, usersRouter);
app.use(`${vAPI}/permissions`, permissionsRouter);
app.use(`${vAPI}/audit`, auditRouter);
app.use(`${vAPI}/stock-quantity-report`, stockQuantityReportRoutes);
app.use(`${vAPI}/product-sales-profit`, productSalesProfitRoutes);
app.use(`${vAPI}/dashboard`, dashboardRoutes);
app.use(`${vAPI}/reports`, reportsRoutes);
app.use(`${vAPI}/employee`, employeeRoutes);
app.use(`${vAPI}/salaries`, salaryRoutes);
app.use(`${vAPI}/commissions`, commissionRoutes);
app.use(`${vAPI}/shifts`, shiftRoutes);
app.use(`${vAPI}/shift-assignment`, shiftAssignmentRoutes);
app.use(`${vAPI}/barcode-generator`, barcodeRoutes);

// Website Routes (paginated, server-side filtered)
app.use(`${vAPI}/web`, webRoutes);

// App Routes
app.use(`${vAPI}/customer/app`, appRoutes);
app.use(`${vAPI}/customer`, customerRoutes);
app.use(`${vAPI}/app/customer/order`, customerOrderRoutes);
app.use(`${vAPI}/customer/device-identity`, deviceIdentityRoutes);
app.use(`${vAPI}/guest/order`, guestOrderRoutes); // Guest checkout route
app.use(`${vAPI}/payments/alfalah`, alfalahRoutes);

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
app.use(errorHandler);
app.use(notFoundHandler);

// Remind about long-open registers — never auto-close (cashiers must close with a count).
if (!process.env.VERCEL) {
  cron.schedule('0 * * * *', async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = await prisma.cashFlow.findMany({
      where: { status: 'OPEN', opened_at: { lte: cutoff } },
      include: { branch: { select: { name: true } } },
    });
    if (stale.length) {
      console.warn(
        `⚠️ ${stale.length} register(s) still open after 24h (not auto-closed):`,
        stale.map((d) => `${d.branch?.name ?? d.branch_id} ${d.id}`).join(', '),
      );
    }
  });
}

// Start server only when not running on Vercel serverless
if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
}

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export default app;
