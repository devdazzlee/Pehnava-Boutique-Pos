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
app.use(`${vAPI}/dashboard`, dashboardRoutes);
app.use(`${vAPI}/reports`, reportsRoutes);
app.use(`${vAPI}/employee`, employeeRoutes);
app.use(`${vAPI}/salaries`, salaryRoutes);
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

// Error handling
app.use(errorHandler);
app.use(notFoundHandler);

// Cron job to close drawers after 24 hours
cron.schedule('0 * * * *', async () => {
  const now = new Date();
  console.log("🕐 Cron job running at:", now.toISOString());
  
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  console.log("📅 Looking for drawers opened before:", cutoff.toISOString());
  
  const openDrawers = await prisma.cashFlow.findMany({
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
    await prisma.cashFlow.update({
      where: { id: drawer.id },
      data: { status: 'CLOSED', closed_at: new Date() },
    });
    console.log(`✅ Auto-closed drawer ${drawer.id} for branch: ${drawer.branch?.name || 'Unknown'}`);
  }
  
  if (openDrawers.length === 0) {
    console.log("✅ No drawers needed auto-closing");
  }
});

// Start server
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

