import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { addDecimal, asNumber } from '../utils/helpers';
import { Prisma } from '@prisma/client';
import { startOfBusinessMonth } from '../utils/timezone';

export class PurchaseService {
  async createPurchase(data: {
    productId: string;
    supplierId: string;
    warehouseBranchId: string;
    quantity: number;
    costPrice: number;
    salePrice: number;
    purchaseDate?: Date;
    invoiceRef?: string;
    notes?: string;
    deliveryStatus?: 'PARTIAL' | 'COMPLETE';
    createdBy: string;
  }) {
    const warehouse = await prisma.branch.findFirst({
      where: { id: data.warehouseBranchId, branch_type: 'WAREHOUSE' },
    });
    if (!warehouse) {
      const anyBranch = await prisma.branch.findUnique({
        where: { id: data.warehouseBranchId },
      });
      if (!anyBranch) throw new AppError(404, 'Warehouse branch not found');
    }

    return prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          product_id: data.productId,
          supplier_id: data.supplierId,
          warehouse_branch_id: data.warehouseBranchId,
          quantity: data.quantity,
          cost_price: data.costPrice,
          sale_price: data.salePrice,
          purchase_date: data.purchaseDate || new Date(),
          invoice_ref: data.invoiceRef,
          notes: data.notes,
          delivery_status: data.deliveryStatus || 'COMPLETE',
          created_by: data.createdBy,
        },
        include: {
          product: true,
          supplier: true,
          warehouse_branch: true,
          user: { select: { email: true } },
        },
      });

      let stock = await tx.stock.findUnique({
        where: {
          product_id_branch_id: {
            product_id: data.productId,
            branch_id: data.warehouseBranchId,
          },
        },
      });

      const qty = data.quantity;
      const previousQty = stock ? asNumber(stock.current_quantity) : 0;
      const newQty = stock ? addDecimal(stock.current_quantity, qty) : qty;

      if (stock) {
        await tx.stock.update({
          where: {
            product_id_branch_id: {
              product_id: data.productId,
              branch_id: data.warehouseBranchId,
            },
          },
          data: { current_quantity: newQty },
        });
      } else {
        await tx.stock.create({
          data: {
            product_id: data.productId,
            branch_id: data.warehouseBranchId,
            current_quantity: qty,
          },
        });
      }

      await tx.stockMovement.create({
        data: {
          product_id: data.productId,
          branch_id: data.warehouseBranchId,
          movement_type: 'PURCHASE',
          reference_id: purchase.id,
          reference_type: 'purchase',
          quantity_change: qty,
          previous_qty: previousQty,
          new_qty: typeof newQty === 'number' ? newQty : asNumber(newQty as Prisma.Decimal),
          unit_cost: data.costPrice,
          notes: data.notes,
          created_by: data.createdBy,
        },
      });

      return purchase;
    });
  }

  // Multi-line GRN — saves the supplier delivery as N Purchase rows + one
  // stock movement per line, all in a single transaction. Use this for the
  // "Save purchase" flow on the Stock In screen.
  //
  // Payment modes (supplier credit / cash):
  // - CREDIT: full bill stays payable on the supplier ledger
  // - CASH: auto-records a supplier payment for the full bill total
  // - MIX: records a partial payment; remainder stays as balance due
  async createBulkPurchase(data: {
    supplierId: string;
    warehouseBranchId: string;
    purchaseDate?: Date;
    invoiceRef?: string;
    notes?: string;
    batchNo?: string;
    expiryDate?: Date;
    deliveryStatus?: 'PARTIAL' | 'COMPLETE';
    paymentMode?: 'CASH' | 'CREDIT' | 'MIX';
    paidAmount?: number;
    paymentMethod?: string;
    paymentReference?: string;
    paymentNotes?: string;
    lines: Array<{
      productId: string;
      quantity: number;
      costPrice: number;
      salePrice?: number;
    }>;
    createdBy: string;
  }) {
    if (!Array.isArray(data.lines) || data.lines.length === 0) {
      throw new AppError(400, 'At least one line is required');
    }

    const branch = await prisma.branch.findUnique({
      where: { id: data.warehouseBranchId },
    });
    if (!branch) throw new AppError(404, 'Warehouse branch not found');

    const supplier = await prisma.supplier.findUnique({
      where: { id: data.supplierId },
    });
    if (!supplier) throw new AppError(404, 'Supplier not found');

    const billTotal = data.lines.reduce(
      (sum, line) => sum + line.quantity * line.costPrice,
      0,
    );
    const paymentMode = data.paymentMode || 'CREDIT';
    let paidNow = 0;
    if (paymentMode === 'CASH') {
      paidNow = billTotal;
    } else if (paymentMode === 'MIX') {
      paidNow = Number(data.paidAmount) || 0;
      if (paidNow <= 0) {
        throw new AppError(400, 'Enter how much was paid now for a mix payment');
      }
      if (paidNow >= billTotal && billTotal > 0) {
        throw new AppError(
          400,
          'Mix paid amount must be less than bill total (use Cash for full pay)',
        );
      }
    }
    const creditRemaining = Math.max(0, billTotal - paidNow);

    return prisma.$transaction(async (tx) => {
      const purchaseIds: string[] = [];

      for (const line of data.lines) {
        if (!line.productId) throw new AppError(400, 'Product is required on every line');
        if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
          throw new AppError(400, `Invalid quantity on line for product ${line.productId}`);
        }
        if (!Number.isFinite(line.costPrice) || line.costPrice < 0) {
          throw new AppError(400, `Invalid cost price on line for product ${line.productId}`);
        }

        const noteParts: string[] = [];
        if (data.batchNo) noteParts.push(`Batch: ${data.batchNo}`);
        if (data.expiryDate) noteParts.push(`Expiry: ${data.expiryDate.toISOString().slice(0, 10)}`);
        if (data.notes) noteParts.push(data.notes);
        noteParts.push(
          `Pay: ${paymentMode}` +
            (paymentMode !== 'CREDIT'
              ? ` · paid ${paidNow.toFixed(2)} · credit ${creditRemaining.toFixed(2)}`
              : ` · credit ${billTotal.toFixed(2)}`),
        );
        const noteText = noteParts.length > 0 ? noteParts.join(' | ') : undefined;

        const purchase = await tx.purchase.create({
          data: {
            product_id: line.productId,
            supplier_id: data.supplierId,
            warehouse_branch_id: data.warehouseBranchId,
            quantity: line.quantity,
            cost_price: line.costPrice,
            sale_price: line.salePrice ?? line.costPrice,
            purchase_date: data.purchaseDate || new Date(),
            invoice_ref: data.invoiceRef,
            notes: noteText,
            delivery_status: data.deliveryStatus || 'COMPLETE',
            created_by: data.createdBy,
          },
        });

        let stock = await tx.stock.findUnique({
          where: {
            product_id_branch_id: {
              product_id: line.productId,
              branch_id: data.warehouseBranchId,
            },
          },
        });

        const previousQty = stock ? asNumber(stock.current_quantity) : 0;
        const newQty = stock
          ? addDecimal(stock.current_quantity, line.quantity)
          : line.quantity;

        if (stock) {
          await tx.stock.update({
            where: {
              product_id_branch_id: {
                product_id: line.productId,
                branch_id: data.warehouseBranchId,
              },
            },
            data: { current_quantity: newQty },
          });
        } else {
          await tx.stock.create({
            data: {
              product_id: line.productId,
              branch_id: data.warehouseBranchId,
              current_quantity: line.quantity,
            },
          });
        }

        await tx.stockMovement.create({
          data: {
            product_id: line.productId,
            branch_id: data.warehouseBranchId,
            movement_type: 'PURCHASE',
            reference_id: purchase.id,
            reference_type: 'purchase',
            quantity_change: line.quantity,
            previous_qty: previousQty,
            new_qty: typeof newQty === 'number' ? newQty : asNumber(newQty as Prisma.Decimal),
            unit_cost: line.costPrice,
            notes: noteText,
            created_by: data.createdBy,
          },
        });

        purchaseIds.push(purchase.id);
      }

      let paymentId: string | null = null;
      if (paidNow > 0) {
        const payNotes = [
          data.paymentNotes,
          `Stock-in ${paymentMode}`,
          data.invoiceRef ? `Invoice ${data.invoiceRef}` : null,
          creditRemaining > 0
            ? `Remaining on credit ${creditRemaining.toFixed(2)}`
            : 'Fully paid at stock-in',
        ]
          .filter(Boolean)
          .join(' · ');

        const payment = await tx.supplierPayment.create({
          data: {
            supplier_id: data.supplierId,
            amount: paidNow,
            payment_date: data.purchaseDate || new Date(),
            method: data.paymentMethod || 'CASH',
            reference: data.paymentReference || data.invoiceRef || null,
            notes: payNotes || null,
            created_by: data.createdBy,
          },
        });
        paymentId = payment.id;
      }

      return {
        count: purchaseIds.length,
        purchaseIds,
        billTotal,
        paymentMode,
        paidAmount: paidNow,
        creditRemaining,
        paymentId,
      };
    });
  }

  async listPurchases(params: {
    page?: number;
    limit?: number;
    productId?: string;
    supplierId?: string;
    branchId?: string;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseWhereInput = {};
    if (params.productId) where.product_id = params.productId;
    if (params.supplierId) where.supplier_id = params.supplierId;
    if (params.branchId) where.warehouse_branch_id = params.branchId;
    if (params.userId) where.created_by = params.userId;
    if (params.startDate || params.endDate) {
      where.purchase_date = {};
      if (params.startDate) where.purchase_date.gte = params.startDate;
      if (params.endDate) where.purchase_date.lte = params.endDate;
    }

    const [total, purchases] = await Promise.all([
      prisma.purchase.count({ where }),
      prisma.purchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { purchase_date: 'desc' },
        include: {
          product: true,
          supplier: true,
          warehouse_branch: true,
          user: { select: { email: true } },
        },
      }),
    ]);

    return {
      data: purchases,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getPurchaseById(id: string) {
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        product: true,
        supplier: true,
        warehouse_branch: true,
        user: { select: { email: true } },
      },
    });
    if (!purchase) throw new AppError(404, 'Purchase not found');
    return purchase;
  }

  async getMonthlyStats(warehouseBranchId?: string) {
    const startOfMonth = startOfBusinessMonth();

    const where: Prisma.PurchaseWhereInput = {
      purchase_date: { gte: startOfMonth },
    };
    if (warehouseBranchId) where.warehouse_branch_id = warehouseBranchId;

    const purchases = await prisma.purchase.findMany({
      where,
      include: { product: true },
    });

    const totalQuantity = purchases.reduce(
      (sum, p) => sum + asNumber(p.quantity),
      0
    );
    const totalValue = purchases.reduce(
      (sum, p) => sum + asNumber(p.quantity) * asNumber(p.cost_price),
      0
    );

    return {
      totalPurchases: purchases.length,
      totalQuantity,
      totalValue,
    };
  }
}
