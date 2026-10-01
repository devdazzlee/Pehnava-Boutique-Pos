import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { addDecimal, asNumber } from '../utils/helpers';
import { startOfBusinessMonth } from '../utils/timezone';

const STOCK_OUT_TYPES = ['SALE', 'DAMAGE', 'LOSS', 'RETURN', 'EXPIRED'] as const;
type StockOutReason = (typeof STOCK_OUT_TYPES)[number];

export class StockOutService {
  async logStockOut(data: {
    productId: string;
    branchId: string;
    quantity: number;
    reason: StockOutReason;
    notes?: string;
    createdBy: string;
  }) {
    if (data.quantity <= 0) {
      throw new AppError(400, 'Quantity must be greater than 0');
    }
    if (!STOCK_OUT_TYPES.includes(data.reason)) {
      throw new AppError(400, 'Invalid stock out reason');
    }

    return prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findUnique({
        where: {
          product_id_branch_id: {
            product_id: data.productId,
            branch_id: data.branchId,
          },
        },
      });

      if (!stock) throw new AppError(404, 'Stock not found');

      const currentQty = asNumber(stock.current_quantity);
      if (currentQty < data.quantity) {
        throw new AppError(400, 'Insufficient stock to remove');
      }

      const newQty = addDecimal(stock.current_quantity, -data.quantity);

      await tx.stock.update({
        where: {
          product_id_branch_id: {
            product_id: data.productId,
            branch_id: data.branchId,
          },
        },
        data: { current_quantity: newQty },
      });

      await tx.stockMovement.create({
        data: {
          product_id: data.productId,
          branch_id: data.branchId,
          movement_type: data.reason,
          quantity_change: -data.quantity,
          previous_qty: stock.current_quantity,
          new_qty: newQty,
          notes: data.notes || `${data.reason} - Stock out`,
          created_by: data.createdBy,
        },
      });

      return { newQty, success: true };
    });
  }

  // Bulk dispatch — accepts many lines and removes stock for each, all
  // inside one transaction so a single failure rolls everything back.
  async logBulkStockOut(data: {
    branchId: string;
    reason: StockOutReason;
    customerId?: string;
    documentRef?: string;
    dispatchDate?: string;
    notes?: string;
    lines: Array<{ productId: string; quantity: number; rate?: number }>;
    createdBy: string;
  }) {
    if (!Array.isArray(data.lines) || data.lines.length === 0) {
      throw new AppError(400, 'At least one line is required');
    }
    if (!STOCK_OUT_TYPES.includes(data.reason)) {
      throw new AppError(400, 'Invalid stock out reason');
    }

    return prisma.$transaction(async (tx) => {
      const movementIds: string[] = [];

      for (const line of data.lines) {
        if (!line.productId) throw new AppError(400, 'Product is required on every line');
        if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
          throw new AppError(400, `Invalid quantity on line for product ${line.productId}`);
        }

        const stock = await tx.stock.findUnique({
          where: {
            product_id_branch_id: {
              product_id: line.productId,
              branch_id: data.branchId,
            },
          },
        });

        if (!stock) {
          throw new AppError(404, `Stock not found for product ${line.productId}`);
        }

        const currentQty = asNumber(stock.current_quantity);
        if (currentQty < line.quantity) {
          throw new AppError(
            400,
            `Insufficient stock for product ${line.productId}. Available: ${currentQty}, requested: ${line.quantity}`,
          );
        }

        const newQty = addDecimal(stock.current_quantity, -line.quantity);

        await tx.stock.update({
          where: {
            product_id_branch_id: {
              product_id: line.productId,
              branch_id: data.branchId,
            },
          },
          data: { current_quantity: newQty },
        });

        // Compose a useful note line — preserves the dispatch metadata next
        // to the per-line movement so the history view can read it back.
        const noteParts: string[] = [];
        if (data.documentRef) noteParts.push(`Ref: ${data.documentRef}`);
        if (line.rate != null) noteParts.push(`Rate: ${line.rate}`);
        if (data.notes) noteParts.push(data.notes);
        const noteText = noteParts.length > 0 ? noteParts.join(' | ') : `${data.reason} - Stock out`;

        const movement = await tx.stockMovement.create({
          data: {
            product_id: line.productId,
            branch_id: data.branchId,
            movement_type: data.reason,
            quantity_change: -line.quantity,
            previous_qty: stock.current_quantity,
            new_qty: newQty,
            unit_cost: line.rate ?? undefined,
            notes: noteText,
            reference_type: 'stock-out',
            created_by: data.createdBy,
          },
        });

        movementIds.push(movement.id);
      }

      return { count: movementIds.length, movementIds };
    });
  }

  // Paginated history of stock-out movements. Filters by reason / date range
  // / branch / product. Powers the "History Logs" tab.
  async listStockOutMovements(params: {
    page?: number;
    limit?: number;
    reason?: StockOutReason;
    branchId?: string;
    productId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.max(1, Math.min(200, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {
      // Stock-out movements always have a negative quantity_change and a
      // type from the outbound set.
      quantity_change: { lt: 0 },
      movement_type: params.reason
        ? params.reason
        : { in: ['SALE', 'DAMAGE', 'LOSS', 'EXPIRED', 'RETURN'] as any },
    };

    if (params.branchId) where.branch_id = params.branchId;
    if (params.productId) where.product_id = params.productId;
    if (params.startDate || params.endDate) {
      where.created_at = {};
      if (params.startDate) where.created_at.gte = params.startDate;
      if (params.endDate) where.created_at.lte = params.endDate;
    }

    const [total, rows] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          branch: { select: { id: true, name: true } },
          user: { select: { id: true, email: true } },
        },
      }),
    ]);

    return {
      data: rows,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async getMonthlyStats(branchId?: string) {
    const startOfMonth = startOfBusinessMonth();

    const where: Prisma.StockMovementWhereInput = {
      quantity_change: { lt: 0 },
      movement_type: { in: ['SALE', 'DAMAGE', 'LOSS', 'EXPIRED', 'RETURN'] as any },
      created_at: { gte: startOfMonth },
    };
    if (branchId) where.branch_id = branchId;

    const movements = await prisma.stockMovement.findMany({
      where,
      select: {
        quantity_change: true,
        unit_cost: true,
        movement_type: true,
      },
    });

    const totalDispatches = movements.length;
    const totalQuantity = movements.reduce(
      (sum, m) => sum + Math.abs(asNumber(m.quantity_change)),
      0,
    );
    const totalValue = movements.reduce((sum, m) => {
      const qty = Math.abs(asNumber(m.quantity_change));
      const rate = asNumber(m.unit_cost);
      return sum + qty * rate;
    }, 0);

    const byReason: Record<string, number> = {};
    for (const m of movements) {
      const key = String(m.movement_type || 'OTHER');
      byReason[key] = (byReason[key] || 0) + 1;
    }

    return {
      totalDispatches,
      totalQuantity,
      totalValue,
      byReason,
    };
  }

  async logReturn(data: {
    productId: string;
    branchId: string;
    quantity: number;
    notes?: string;
    createdBy: string;
  }) {
    if (data.quantity <= 0) {
      throw new AppError(400, 'Quantity must be greater than 0');
    }

    return prisma.$transaction(async (tx) => {
      let stock = await tx.stock.findUnique({
        where: {
          product_id_branch_id: {
            product_id: data.productId,
            branch_id: data.branchId,
          },
        },
      });

      let previousQty = 0;
      let newQty: number | Prisma.Decimal = data.quantity;

      if (stock) {
        previousQty = asNumber(stock.current_quantity);
        newQty = addDecimal(stock.current_quantity, data.quantity);
        await tx.stock.update({
          where: {
            product_id_branch_id: {
              product_id: data.productId,
              branch_id: data.branchId,
            },
          },
          data: { current_quantity: newQty },
        });
      } else {
        await tx.stock.create({
          data: {
            product_id: data.productId,
            branch_id: data.branchId,
            current_quantity: data.quantity,
          },
        });
      }

      await tx.stockMovement.create({
        data: {
          product_id: data.productId,
          branch_id: data.branchId,
          movement_type: 'RETURN',
          quantity_change: data.quantity,
          previous_qty: previousQty,
          new_qty: typeof newQty === 'number' ? newQty : asNumber(newQty),
          notes: data.notes || 'Return - Stock re-added',
          created_by: data.createdBy,
        },
      });

      return { newQty, success: true };
    });
  }
}
