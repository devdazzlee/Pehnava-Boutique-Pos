import { PaymentMethod, PaymentStatus, Prisma, SaleItemType, SaleStatus, StockMovementType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { businessTodayRange } from '../utils/timezone';

interface ReturnItem {
  productId: string;
  quantity: number;
  disposition?: 'RESTOCK' | 'DAMAGED' | 'UNSELLABLE';
}

interface ExchangeItem {
  productId: string;
  quantity: number;
  price: number;
}

interface HoldSaleCartItem {
  id: string;
  productId?: string;
  name: string;
  price: number;
  originalPrice?: number;
  actualUnitPrice?: number;
  quantity: number;
  category?: string;
  unitId?: string;
  unitName?: string;
  unit?: string;
}

/** Product on sale lines must include unit so receipt QTY can show "1 Kg". */
const saleItemProductInclude = {
  product: {
    include: {
      unit: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.SaleItemInclude;

class SaleService {
  async getSales({
    branchId,
    page,
    limit,
    search,
    startDate,
    endDate,
    paymentMethod,
    paymentStatus,
    status,
    cashierId,
    customerId,
    salespersonId,
    sortBy = 'sale_date',
    sortOrder = 'desc',
    includeReturns = false,
  }: {
    branchId?: string;
    page?: number;
    limit?: number;
    search?: string;
    startDate?: Date;
    endDate?: Date;
    paymentMethod?: string;
    paymentStatus?: string;
    status?: string;
    cashierId?: string;
    customerId?: string;
    salespersonId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    /**
     * By default the list is real sales only. Return/exchange child rows
     * (`original_sale_id != null`, the `RTN-*` transactions) are excluded so a
     * single return doesn't show up as two rows in Sales History. Pass `true`
     * to include them.
     */
    includeReturns?: boolean;
  }) {
    const normalizedSearch = search?.replace(/\s+/g, ' ').trim();

    const where: Prisma.SaleWhereInput = {
      ...(branchId ? { branch_id: branchId } : {}),
      ...(cashierId ? { created_by: cashierId } : {}),
      ...(customerId ? { customer_id: customerId } : {}),
      ...(salespersonId ? { salesperson_id: salespersonId === 'none' ? null : salespersonId } : {}),
      ...(paymentMethod && Object.values(PaymentMethod).includes(paymentMethod as PaymentMethod)
        ? { payment_method: paymentMethod as PaymentMethod }
        : {}),
      ...(paymentStatus && Object.values(PaymentStatus).includes(paymentStatus as PaymentStatus)
        ? { payment_status: paymentStatus as PaymentStatus }
        : {}),
      ...(status && Object.values(SaleStatus).includes(status as SaleStatus)
        ? { status: status as SaleStatus }
        : {}),
      ...(normalizedSearch
        ? {
            OR: [
              { sale_number: { contains: normalizedSearch, mode: 'insensitive' } },
              { invoice_number: { contains: normalizedSearch, mode: 'insensitive' } },
              { customer: { email: { contains: normalizedSearch, mode: 'insensitive' } } },
              { customer: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
              { customer: { phone_number: { contains: normalizedSearch, mode: 'insensitive' } } },
              { notes: { contains: normalizedSearch, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(startDate || endDate
        ? {
            sale_date: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    // Rows shown in the list / counted as "sales". Pure refund child rows
    // (`original_sale_id != null` AND status REFUNDED) are hidden by default so
    // a single return doesn't show up twice in Sales History. Exchange child
    // rows (status EXCHANGED) are kept — they represent new goods sold / money
    // collected. `where` (without this restriction) is still used for the
    // refund aggregate below so "Total Refunds" keeps counting everything.
    const listWhere: Prisma.SaleWhereInput = includeReturns
      ? where
      : {
          ...where,
          NOT: {
            AND: [
              { original_sale_id: { not: null } },
              { status: SaleStatus.REFUNDED },
            ],
          },
        };

    const include = {
      sale_items: {
        include: saleItemProductInclude,
      },
      customer: true,
      salesperson: { select: { id: true, name: true, employee_code: true } },
      branch: {
        select: {
          id: true,
          name: true,
          address: true,
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          role: true,
        },
      },
      original_sale: {
        select: {
          id: true,
          sale_number: true,
        },
      },
      _count: {
        select: {
          return_sales: true,
        },
      },
    } satisfies Prisma.SaleInclude;

    const allowedSortFields = new Set([
      'sale_date',
      'sale_number',
      'total_amount',
      'subtotal',
      'discount_amount',
      'tax_amount',
      'payment_method',
      'payment_status',
      'status',
      'created_at',
    ]);
    const orderField = allowedSortFields.has(sortBy) ? sortBy : 'sale_date';
    const orderDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy = { [orderField]: orderDirection } as Prisma.SaleOrderByWithRelationInput;

    const buildSummary = async () => {
      const [aggregates, orderCount, refundAgg] = await Promise.all([
        prisma.sale.aggregate({
          where: listWhere,
          _sum: {
            total_amount: true,
            tax_amount: true,
            discount_amount: true,
          },
          _count: { _all: true },
          _avg: { total_amount: true },
        }),
        prisma.sale.count({
          where: {
            ...where,
            status: SaleStatus.COMPLETED,
            original_sale_id: null,
          },
        }),
        prisma.sale.aggregate({
          where: {
            ...where,
            OR: [
              { status: SaleStatus.REFUNDED },
              { original_sale_id: { not: null } },
              { total_amount: { lt: 0 } },
            ],
          },
          _sum: { total_amount: true },
          _count: { _all: true },
        }),
      ]);

      const totalSalesAmount = Number(aggregates._sum.total_amount || 0);
      const totalTax = Number(aggregates._sum.tax_amount || 0);
      const totalDiscounts = Number(aggregates._sum.discount_amount || 0);
      const refundsAmount = Math.abs(Number(refundAgg._sum.total_amount || 0));

      return {
        totalSales: totalSalesAmount,
        totalOrders: aggregates._count._all,
        completedOrders: orderCount,
        totalRefunds: refundsAmount,
        refundCount: refundAgg._count._all,
        averageOrderValue: orderCount > 0 ? totalSalesAmount / Math.max(orderCount, 1) : Number(aggregates._avg.total_amount || 0),
        totalTaxCollected: totalTax,
        totalDiscounts,
      };
    };

    const cashiersPromise = prisma.user.findMany({
      where: {
        sales: branchId ? { some: { branch_id: branchId } } : { some: {} },
      },
      select: { id: true, email: true, role: true },
      orderBy: { email: 'asc' },
      take: 200,
    });

    // Always paginate — never return the full sales table.
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const [total, data, summary, cashiers] = await Promise.all([
      prisma.sale.count({ where: listWhere }),
      prisma.sale.findMany({
        where: listWhere,
        include,
        orderBy,
        skip,
        take: safeLimit,
      }),
      buildSummary(),
      cashiersPromise,
    ]);

    return {
      data,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        summary,
        cashiers,
      },
    };
  }

  async cancelSale(saleId: string) {
    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new AppError(404, 'Sale not found');
    if (sale.status === SaleStatus.CANCELLED) {
      throw new AppError(400, 'Sale is already cancelled');
    }
    if (sale.original_sale_id) {
      throw new AppError(400, 'Return/exchange transactions cannot be cancelled here');
    }

    return prisma.sale.update({
      where: { id: saleId },
      data: { status: SaleStatus.CANCELLED },
      include: {
        sale_items: { include: saleItemProductInclude },
        customer: true,
        branch: { select: { id: true, name: true, address: true } },
        user: { select: { id: true, email: true, role: true } },
      },
    });
  }

  async updateSale(
    saleId: string,
    data: {
      paymentMethod?: PaymentMethod;
      paymentStatus?: PaymentStatus;
      status?: SaleStatus;
      notes?: string | null;
      discountAmount?: number;
      customerId?: string | null;
      salespersonId?: string | null;
      paymentReceived?: number;
      items?: Array<{
        productId: string;
        quantity: number;
        price: number;
        discountAmount?: number;
      }>;
      updatedBy?: string;
    },
  ) {
    const existing = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { sale_items: true },
    });
    if (!existing) throw new AppError(404, 'Sale not found');
    if (existing.original_sale_id) {
      throw new AppError(400, 'Return/exchange transactions cannot be edited here');
    }
    if (existing.status === SaleStatus.CANCELLED) {
      throw new AppError(400, 'Cancelled sales cannot be edited');
    }

    const branchId = existing.branch_id;
    if (!branchId) throw new AppError(400, 'Sale has no branch');

    const hasItemsUpdate = Array.isArray(data.items);

    if (hasItemsUpdate) {
      const items = (data.items || [])
        .map((it) => ({
          productId: it.productId,
          quantity: Number(it.quantity),
          price: Number(it.price),
          discountAmount: Math.max(0, Number(it.discountAmount || 0)),
        }))
        .filter((it) => it.productId && it.quantity > 0 && !Number.isNaN(it.price));

      if (!items.length) {
        throw new AppError(400, 'At least one line item is required');
      }

      const productIds = [...new Set(items.map((i) => i.productId))];
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true },
      });
      if (products.length !== productIds.length) {
        throw new AppError(400, 'One or more products were not found');
      }

      // Old sold qty per product (positive) — original sale lines only
      const oldQtyMap = new Map<string, number>();
      for (const row of existing.sale_items) {
        if (row.item_type && row.item_type !== SaleItemType.ORIGINAL) continue;
        const qty = Math.abs(row.quantity.toNumber());
        oldQtyMap.set(row.product_id, (oldQtyMap.get(row.product_id) || 0) + qty);
      }

      const newQtyMap = new Map<string, number>();
      for (const it of items) {
        newQtyMap.set(it.productId, (newQtyMap.get(it.productId) || 0) + it.quantity);
      }

      const affectedProductIds = [
        ...new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]),
      ];
      const stocks = await prisma.stock.findMany({
        where: { branch_id: branchId, product_id: { in: affectedProductIds } },
      });
      const stockMap = new Map(stocks.map((s) => [s.product_id, s]));

      type MoveRow = {
        product_id: string;
        previous_qty: Prisma.Decimal;
        new_qty: Prisma.Decimal;
        quantity_change: Prisma.Decimal;
      };
      const movements: MoveRow[] = [];

      for (const productId of affectedProductIds) {
        const oldQty = oldQtyMap.get(productId) || 0;
        const newQty = newQtyMap.get(productId) || 0;
        const soldDelta = newQty - oldQty; // +more sold, -less sold
        if (soldDelta === 0) continue;

        const existingStock = stockMap.get(productId);
        const prev = new Prisma.Decimal(existingStock?.current_quantity ?? 0);
        // stock change is opposite of sold delta
        const change = new Prisma.Decimal(-soldDelta);
        const next = prev.plus(change);
        movements.push({
          product_id: productId,
          previous_qty: prev,
          new_qty: next,
          quantity_change: change,
        });
      }

      const lineSubtotals = items.map((it) => ({
        ...it,
        lineTotal: Math.max(0, it.price * it.quantity - (it.discountAmount || 0)),
      }));
      const subtotalAmt = lineSubtotals.reduce((s, it) => s + it.lineTotal, 0);
      const orderDiscount =
        typeof data.discountAmount === 'number' && !Number.isNaN(data.discountAmount)
          ? Math.max(0, data.discountAmount)
          : Number(existing.discount_amount || 0);
      const taxAmt = Number(existing.tax_amount || 0);
      const finalTotal = Math.max(0, subtotalAmt - orderDiscount + taxAmt);

      const ops: Prisma.PrismaPromise<any>[] = [];

      ops.push(
        prisma.saleItem.deleteMany({ where: { sale_id: saleId } }),
      );

      ops.push(
        prisma.sale.update({
          where: { id: saleId },
          data: {
            ...(data.paymentMethod && Object.values(PaymentMethod).includes(data.paymentMethod)
              ? { payment_method: data.paymentMethod }
              : {}),
            ...(data.paymentStatus && Object.values(PaymentStatus).includes(data.paymentStatus)
              ? { payment_status: data.paymentStatus }
              : {}),
            ...(data.status && Object.values(SaleStatus).includes(data.status)
              ? { status: data.status }
              : {}),
            ...(data.notes !== undefined ? { notes: data.notes } : {}),
            ...(data.customerId !== undefined
              ? { customer_id: data.customerId || null }
              : {}),
            ...(data.salespersonId !== undefined
              ? { salesperson_id: data.salespersonId || null }
              : {}),
            ...(typeof data.paymentReceived === 'number' && !Number.isNaN(data.paymentReceived)
              ? { payment_received: new Prisma.Decimal(Math.max(0, data.paymentReceived)) }
              : {}),
            discount_amount: new Prisma.Decimal(orderDiscount),
            subtotal: new Prisma.Decimal(subtotalAmt),
            total_amount: new Prisma.Decimal(finalTotal),
            sale_items: {
              create: lineSubtotals.map((item) => ({
                product: { connect: { id: item.productId } },
                quantity: new Prisma.Decimal(item.quantity),
                unit_price: new Prisma.Decimal(item.price),
                discount_amount: new Prisma.Decimal(item.discountAmount || 0),
                line_total: new Prisma.Decimal(item.lineTotal),
                item_type: SaleItemType.ORIGINAL,
              })),
            },
          },
        }),
      );

      for (const m of movements) {
        ops.push(
          prisma.stock.upsert({
            where: {
              product_id_branch_id: {
                product_id: m.product_id,
                branch_id: branchId,
              },
            },
            update: {
              current_quantity: m.new_qty,
            },
            create: {
              product_id: m.product_id,
              branch_id: branchId,
              current_quantity: m.new_qty,
              minimum_quantity: new Prisma.Decimal(0),
              maximum_quantity: new Prisma.Decimal(1000),
              reserved_quantity: new Prisma.Decimal(0),
            },
          }),
        );
        ops.push(
          prisma.stockMovement.create({
            data: {
              product_id: m.product_id,
              branch_id: branchId,
              movement_type: StockMovementType.ADJUSTMENT,
              quantity_change: m.quantity_change,
              previous_qty: m.previous_qty,
              new_qty: m.new_qty,
              reference_id: saleId,
              reference_type: "sale_edit",
              notes: `Sale edit ${existing.sale_number}`,
              ...(data.updatedBy || existing.created_by
                ? { created_by: data.updatedBy || existing.created_by || undefined }
                : {}),
            },
          }),
        );
      }

      await prisma.$transaction(ops);
    } else {
      // Metadata-only update
      const updateData: Prisma.SaleUpdateInput = {};
      if (data.paymentMethod && Object.values(PaymentMethod).includes(data.paymentMethod)) {
        updateData.payment_method = data.paymentMethod;
      }
      if (data.paymentStatus && Object.values(PaymentStatus).includes(data.paymentStatus)) {
        updateData.payment_status = data.paymentStatus;
      }
      if (data.status && Object.values(SaleStatus).includes(data.status)) {
        updateData.status = data.status;
      }
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.customerId !== undefined) {
        updateData.customer = data.customerId
          ? { connect: { id: data.customerId } }
          : { disconnect: true };
      }
      if (data.salespersonId !== undefined) {
        updateData.salesperson = data.salespersonId
          ? { connect: { id: data.salespersonId } }
          : { disconnect: true };
      }
      if (typeof data.paymentReceived === 'number' && !Number.isNaN(data.paymentReceived)) {
        updateData.payment_received = new Prisma.Decimal(Math.max(0, data.paymentReceived));
      }
      if (typeof data.discountAmount === 'number' && !Number.isNaN(data.discountAmount)) {
        const discount = Math.max(0, data.discountAmount);
        const subtotal = Number(existing.subtotal || 0);
        const tax = Number(existing.tax_amount || 0);
        updateData.discount_amount = new Prisma.Decimal(discount);
        updateData.total_amount = new Prisma.Decimal(Math.max(0, subtotal - discount + tax));
      }
      await prisma.sale.update({ where: { id: saleId }, data: updateData });
    }

    // Returns / exchanges follow their original sale so commission reversals move with it.
    if (data.salespersonId !== undefined) {
      await prisma.sale.updateMany({
        where: { original_sale_id: saleId },
        data: { salesperson_id: data.salespersonId || null },
      });
    }

    return this.getSaleById(saleId);
  }

  async deleteSale(saleId: string) {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { _count: { select: { return_sales: true } } },
    });
    if (!sale) throw new AppError(404, 'Sale not found');
    if (sale._count.return_sales > 0) {
      throw new AppError(400, 'Cannot delete a sale that has return/exchange records. Cancel it instead.');
    }

    await prisma.sale.delete({ where: { id: saleId } });
    return { id: saleId, deleted: true };
  }

  async getAlreadyReturnedQuantities(originalSaleId: string): Promise<Map<string, number>> {
    const prior = await prisma.sale.findMany({
      where: { original_sale_id: originalSaleId },
      include: {
        sale_items: { where: { item_type: SaleItemType.RETURN } },
      },
    });
    const map = new Map<string, number>();
    for (const sale of prior) {
      for (const item of sale.sale_items) {
        const qty = Math.abs(item.quantity.toNumber());
        map.set(item.product_id, (map.get(item.product_id) || 0) + qty);
      }
    }
    return map;
  }

  async getReturnTransactions({
    branchId,
    search,
  }: {
    branchId?: string;
    search?: string;
  }) {
    const normalizedSearch = search?.replace(/\s+/g, ' ').trim();

    return prisma.sale.findMany({
      where: {
        original_sale_id: { not: null },
        ...(branchId ? { branch_id: branchId } : {}),
        ...(normalizedSearch
          ? {
              OR: [
                { sale_number: { contains: normalizedSearch, mode: 'insensitive' } },
                { customer: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
                { customer: { email: { contains: normalizedSearch, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        sale_items: { include: { product: true } },
        customer: true,
        original_sale: { select: { sale_number: true, total_amount: true } },
      },
      orderBy: { sale_date: 'desc' },
      take: 200,
    });
  }

  async getSalesForReturns({ branchId, search }: { branchId?: string; search?: string }) {
    const normalizedSearch = search?.replace(/\s+/g, ' ').trim();

    return prisma.sale.findMany({
      where: {
        branch_id: branchId,
        status: 'COMPLETED', // Only completed sales can be returned
        ...(normalizedSearch
          ? {
              OR: [
                { sale_number: { contains: normalizedSearch, mode: 'insensitive' } },
                { customer: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
                { customer: { email: { contains: normalizedSearch, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        sale_items: {
          where: { item_type: SaleItemType.ORIGINAL },
          include: { product: true },
        },
        customer: true,
      },
      orderBy: { sale_date: 'desc' },
      take: 50, // Limit results for performance
    });
  }

  async getSaleById(saleId: string) {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        sale_items: {
          include: saleItemProductInclude,
        },
        customer: true,
        salesperson: { select: { id: true, name: true, employee_code: true } },
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        original_sale: {
          select: {
            id: true,
            sale_number: true,
          },
        },
        return_sales: {
          select: {
            id: true,
            sale_number: true,
            sale_date: true,
            total_amount: true,
            status: true,
          },
          orderBy: { sale_date: 'desc' },
        },
      },
    });
    if (!sale) throw new AppError(404, 'Sale not found');
    return sale;
  }

  async getHoldSales({ branchId }: { branchId: string }) {
    return prisma.holdSale.findMany({
      where: { branch_id: branchId },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone_number: true,
            is_active: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async createHoldSale({
    branchId,
    customerId,
    createdBy,
    items,
  }: {
    branchId: string;
    customerId?: string;
    createdBy?: string;
    items: HoldSaleCartItem[];
  }) {
    if (!items?.length) {
      throw new AppError(400, 'No items provided for hold sale');
    }

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      throw new AppError(400, 'Invalid branch');
    }

    const normalizedItems = items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      price: Number(item.price),
      originalPrice: Number(item.originalPrice ?? item.price),
      actualUnitPrice: Number(item.actualUnitPrice ?? item.price),
      quantity: Number(item.quantity),
      category: item.category,
      unitId: item.unitId,
      unitName: item.unitName,
      unit: item.unit,
    }));

    const subtotal = normalizedItems.reduce(
      (sum, item) => sum + (item.actualUnitPrice || item.price) * item.quantity,
      0,
    );

    return prisma.holdSale.create({
      data: {
        branch_id: branchId,
        customer_id: customerId?.trim() ? customerId.trim() : null,
        created_by: createdBy,
        items: normalizedItems as Prisma.InputJsonValue,
        subtotal: new Prisma.Decimal(subtotal),
        total_items: normalizedItems.length,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone_number: true,
            is_active: true,
          },
        },
      },
    });
  }

  async retrieveHoldSale({
    holdSaleId,
    branchId,
  }: {
    holdSaleId: string;
    branchId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const holdSale = await tx.holdSale.findFirst({
        where: { id: holdSaleId, branch_id: branchId },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone_number: true,
              is_active: true,
            },
          },
        },
      });

      if (!holdSale) {
        throw new AppError(404, 'Hold sale not found');
      }

      await tx.holdSale.delete({
        where: { id: holdSaleId },
      });

      return holdSale;
    });
  }

  async deleteHoldSale({
    holdSaleId,
    branchId,
  }: {
    holdSaleId: string;
    branchId: string;
  }) {
    const holdSale = await prisma.holdSale.findFirst({
      where: { id: holdSaleId, branch_id: branchId },
      select: { id: true },
    });

    if (!holdSale) {
      throw new AppError(404, 'Hold sale not found');
    }

    await prisma.holdSale.delete({ where: { id: holdSaleId } });
  }

  async createSale({
    branchId,
    customerId,
    salespersonId,
    paymentMethod,
    items,
    discountAmount,
    createdBy,
  }: {
    branchId: string;
    customerId?: string;
    salespersonId?: string | null;
    paymentMethod: Prisma.SaleCreateInput['payment_method'];
    items: Array<{ productId: string; quantity: number; price: number }>;
    discountAmount?: number;
    createdBy: string;
  }) {
    // 1) Validate OUTSIDE any interactive transaction
    const [customer, branch] = await Promise.all([
      customerId ? prisma.customer.findUnique({ where: { id: customerId } }) : null,
      prisma.branch.findUnique({ where: { id: branchId } }),
    ]);
    if (customerId && !customer) throw new AppError(400, 'Invalid customer');
    if (!branch) throw new AppError(400, 'Invalid branch');
    if (!items.length) throw new AppError(400, 'No items provided');
    if (salespersonId) {
      const salesperson = await prisma.employee.findUnique({
        where: { id: salespersonId },
        select: { id: true, is_active: true },
      });
      if (!salesperson) throw new AppError(400, 'Selected salesperson was not found');
    }
  
    // 2) Validate that all products exist
    const productIds = items.map(i => i.productId);
    const uniqueProductIds = [...new Set(productIds)]; // Remove duplicates
    const products = await prisma.product.findMany({
      where: { id: { in: uniqueProductIds } },
      select: { id: true },
    });
    const foundProductIds = new Set(products.map(p => p.id));
    const missingProductIds = uniqueProductIds.filter(id => !foundProductIds.has(id));
    if (missingProductIds.length > 0) {
      throw new AppError(400, `Products not found: ${missingProductIds.join(', ')}`);
    }
  
    // 3) Pre-fetch stock snapshot once
    const stocks = await prisma.stock.findMany({
      where: { product_id: { in: productIds }, branch_id: branchId },
    });
    const stockMap = new Map(stocks.map(s => [s.product_id, s]));
  
    // 4) Group same product lines and compute movements in memory
    const grouped = items.reduce<Record<string, { productId: string; qty: Prisma.Decimal }>>(
      (acc, it) => {
        const key = it.productId;
        if (!acc[key]) acc[key] = { productId: it.productId, qty: new Prisma.Decimal(0) };
        acc[key].qty = acc[key].qty.plus(it.quantity);
        return acc;
      },
      {}
    );
  
    type MoveRow = {
      product_id: string;
      previous_qty: Prisma.Decimal;
      new_qty: Prisma.Decimal;
      quantity_change: Prisma.Decimal; // negative for sale
    };
  
    const movements: MoveRow[] = [];
    for (const gp of Object.values(grouped)) {
      const existing = stockMap.get(gp.productId);
      const prev = new Prisma.Decimal(existing?.current_quantity ?? 0);
      const change = gp.qty.mul(-1); // sale => decrement
      const next = prev.plus(change);
  
      // allow negative stock per your testing; add a check here if you want to block it
      movements.push({
        product_id: gp.productId,
        previous_qty: prev,
        new_qty: next,
        quantity_change: change,
      });
  
      stockMap.set(gp.productId, {
        ...(existing ?? ({} as any)),
        product_id: gp.productId,
        branch_id: branchId,
        current_quantity: next,
      });
    }
  
    // 5) Prepare all writes as a single non-interactive transaction (prevents P2028)
    const subtotalAmt = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const finalDiscount = discountAmount ?? 0;
    const finalTotal = Math.max(0, subtotalAmt - finalDiscount);
  
    const ops: Prisma.PrismaPromise<any>[] = [];
  
    // (a) Sale + items
    ops.push(
      prisma.sale.create({
        data: {
          sale_number: `SALE-${Date.now()}`,
          branch_id: branchId,
          customer_id: customerId,
          salesperson_id: salespersonId || null,
          total_amount: new Prisma.Decimal(finalTotal),
          subtotal: new Prisma.Decimal(subtotalAmt),
          discount_amount: new Prisma.Decimal(finalDiscount),
          payment_method: paymentMethod,
          payment_status: 'PAID',
          status: 'COMPLETED',
          created_by: createdBy,
          sale_items: {
            create: items.map((item) => ({
              product: { connect: { id: item.productId } },
              quantity: new Prisma.Decimal(item.quantity),
              unit_price: new Prisma.Decimal(item.price),
              line_total: new Prisma.Decimal(item.price).mul(item.quantity),
            })),
          },
        },
        include: { sale_items: true },
      })
    );
  
    // (b) Stock upserts (one per product)
    for (const m of movements) {
      const decAbs = m.quantity_change.abs(); // positive decrement amount
      ops.push(
        prisma.stock.upsert({
          where: {
            product_id_branch_id: {
              product_id: m.product_id,
              branch_id: branchId,
            },
          },
          update: {
            current_quantity: { decrement: decAbs },
          },
          create: {
            product_id: m.product_id,
            branch_id: branchId,
            current_quantity: m.new_qty, // start at computed value (can be negative)
            minimum_quantity: new Prisma.Decimal(0),
            maximum_quantity: new Prisma.Decimal(1000),
            reserved_quantity: new Prisma.Decimal(0),
          },
        })
      );
    }
  
    // (c) Stock movements (use computed prev/new; no read-after-write)
    for (const m of movements) {
      ops.push(
        prisma.stockMovement.create({
          data: {
            product_id: m.product_id,
            branch_id: branchId,
            movement_type: 'SALE',
            quantity_change: m.quantity_change, // negative
            previous_qty: m.previous_qty,
            new_qty: m.new_qty,
            created_by: createdBy,
          },
        })
      );
    }
  
    const [sale] = await prisma.$transaction(ops);
    const saleResult = sale as Prisma.SaleGetPayload<{ include: { sale_items: true } }>;
    
    return saleResult;
  }
  

  async getTodaySales({ branchId }: { branchId?: string }) {
    const { start, end } = businessTodayRange();

    return prisma.sale.findMany({
      where: {
        branch_id: branchId,
        sale_date: {
          gte: start,
          lte: end,
        },
      },
      include: {
        customer: true,
      },
      orderBy: { sale_date: 'desc' },
    });
  }

  // async createExchangeOrReturnSale({
  //     originalSaleId,
  //     branchId,
  //     customerId,
  //     returnedItems,
  //     exchangedItems,
  //     createdBy
  // }: {
  //     originalSaleId: string,
  //     branchId: string,
  //     customerId?: string,
  //     returnedItems: { productId: string, quantity: number }[],
  //     exchangedItems: { productId: string, quantity: number, price: number }[],
  //     createdBy: string,
  // }) {
  //     return prisma.$transaction(async (tx) => {
  //         const originalSale = await tx.sale.findUnique({
  //             where: { id: originalSaleId },
  //             include: { sale_items: true },
  //         });
  //         if (!originalSale) throw new AppError(404, "Original sale not found");

  //         const productIds = [
  //             ...returnedItems.map(i => i.productId),
  //             ...exchangedItems.map(i => i.productId)
  //         ];

  //         const stocks = await tx.stock.findMany({
  //             where: { product_id: { in: productIds }, branch_id: branchId }
  //         });

  //         const saleItems: any[] = [];
  //         let total = 0;

  //         // Process Returns
  //         for (const ret of returnedItems) {
  //             const stock = stocks.find(s => s.product_id === ret.productId);
  //             if (!stock) throw new AppError(400, `Stock not found for product ${ret.productId}`);

  //             const originalItem = originalSale.sale_items.find(i => i.product_id === ret.productId);
  //             if (!originalItem) throw new AppError(400, `Product ${ret.productId} not in original sale`);

  //             if (ret.quantity > originalItem.quantity) {
  //                 throw new AppError(400, `Return quantity exceeds original`);
  //             }

  //             await tx.stock.update({
  //                 where: {
  //                     product_id_branch_id: {
  //                         product_id: ret.productId,
  //                         branch_id: branchId,
  //                     }
  //                 },
  //                 data: { current_quantity: { increment: ret.quantity } }
  //             });

  //             await tx.stockMovement.create({
  //                 data: {
  //                     product_id: ret.productId,
  //                     branch_id: branchId,
  //                     movement_type: "RETURN",
  //                     quantity_change: ret.quantity,
  //                     previous_qty: 0,
  //                     new_qty: 0,
  //                     created_by: createdBy,
  //                 },
  //             });

  //             const lineTotal = -(Number(originalItem.unit_price) * ret.quantity);
  //             total += lineTotal;

  //             saleItems.push({
  //                 product_id: ret.productId,
  //                 quantity: -ret.quantity,
  //                 unit_price: originalItem.unit_price,
  //                 line_total: lineTotal,
  //                 item_type: "RETURN",
  //                 ref_sale_item_id: originalItem.id
  //             });
  //         }

  //         // Process Exchanges
  //         for (const item of exchangedItems) {
  //             const stock = stocks.find(s => s.product_id === item.productId);
  //             if (!stock || stock.current_quantity < item.quantity) {
  //                 throw new AppError(400, `Insufficient stock for exchange product ${item.productId}`);
  //             }

  //             await tx.stock.update({
  //                 where: {
  //                     product_id_branch_id: {
  //                         product_id: item.productId,
  //                         branch_id: branchId,
  //                     }
  //                 },
  //                 data: { current_quantity: { decrement: item.quantity } }
  //             });

  //             await tx.stockMovement.create({
  //                 data: {
  //                     product_id: item.productId,
  //                     branch_id: branchId,
  //                     movement_type: "SALE",
  //                     quantity_change: -item.quantity,
  //                     previous_qty: stock.current_quantity,
  //                     new_qty: stock.current_quantity - item.quantity,
  //                     created_by: createdBy,
  //                 },
  //             });

  //             const lineTotal = item.price * item.quantity;
  //             total += lineTotal;

  //             saleItems.push({
  //                 product_id: item.productId,
  //                 quantity: item.quantity,
  //                 unit_price: item.price,
  //                 line_total: lineTotal,
  //                 item_type: "EXCHANGE"
  //             });
  //         }

  //         const sale = await tx.sale.create({
  //             data: {
  //                 sale_number: `SALE-${Date.now()}`,
  //                 branch_id: branchId,
  //                 customer_id: customerId,
  //                 original_sale_id: originalSaleId,
  //                 total_amount: total,
  //                 subtotal: total,
  //                 payment_method: "CASH",
  //                 payment_status: "PAID",
  //                 status: "COMPLETED",
  //                 created_by: createdBy,
  //                 sale_items: {
  //                     create: saleItems,
  //                 },
  //             },
  //             include: { sale_items: true },
  //         });

  //         return sale;
  //     });
  // }

  async createExchangeOrReturnSale({
    originalSaleId,
    branchId,
    customerId,
    returnedItems,
    exchangedItems,
    notes,
    createdBy,
    transactionType,
    returnScope,
    returnReason,
    refundMethod,
    exchangeBalanceAction,
  }: {
    originalSaleId: string;
    branchId?: string | null;
    customerId?: string;
    returnedItems: ReturnItem[];
    exchangedItems: ExchangeItem[];
    notes?: string;
    createdBy: string;
    transactionType?: 'RETURN' | 'EXCHANGE';
    returnScope?: 'FULL' | 'PARTIAL';
    returnReason?: string;
    refundMethod?: string;
    exchangeBalanceAction?: string;
  }) {
    if (!returnedItems.length && !exchangedItems.length) {
      throw new AppError(400, 'No return or exchange items provided');
    }

    const isExchange = exchangedItems.length > 0;
    const resolvedType = transactionType || (isExchange ? 'EXCHANGE' : 'RETURN');

    const uniqueProductIds = [...new Set([
      ...returnedItems.map((item) => item.productId),
      ...exchangedItems.map((item) => item.productId),
    ])];
    const uniqueExchangeProductIds = [...new Set(exchangedItems.map((item) => item.productId))];

    const originalSale = await prisma.sale.findUnique({
      where: { id: originalSaleId },
      include: {
        sale_items: { where: { item_type: SaleItemType.ORIGINAL } },
      },
    });
    if (!originalSale) throw new AppError(400, 'Original sale not found');

    if (originalSale.status === SaleStatus.CANCELLED) {
      throw new AppError(400, 'Cancelled sales cannot be returned');
    }
    if (originalSale.status === SaleStatus.PENDING) {
      throw new AppError(400, 'Pending sales cannot be returned');
    }

    const alreadyReturned = await this.getAlreadyReturnedQuantities(originalSaleId);

    const resolvedBranchId: string | null =
      (branchId && branchId.trim()) || originalSale.branch_id || null;
    if (!resolvedBranchId) {
      throw new AppError(
        400,
        'Branch is required for a refund/exchange. Provide branchId in the request, or assign a branch to the original sale.',
      );
    }

    const [branch, customer, exchangeProducts, stocks] = await Promise.all([
      prisma.branch.findUnique({
        where: { id: resolvedBranchId },
        select: { id: true },
      }),
      customerId
        ? prisma.customer.findUnique({
            where: { id: customerId },
            select: { id: true },
          })
        : Promise.resolve(null),
      uniqueExchangeProductIds.length
        ? prisma.product.findMany({
            where: { id: { in: uniqueExchangeProductIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      uniqueProductIds.length
        ? prisma.stock.findMany({
            where: {
              product_id: { in: uniqueProductIds },
              branch_id: resolvedBranchId,
            },
          })
        : Promise.resolve([] as Array<{ product_id: string; current_quantity: Prisma.Decimal }>),
    ]);

    if (!branch) throw new AppError(400, 'Invalid branch');
    if (customerId && !customer) throw new AppError(400, 'Invalid customer');

    const foundExchangeProductIds = new Set(exchangeProducts.map((product) => product.id));
    const missingExchangeProductIds = uniqueExchangeProductIds.filter(
      (productId) => !foundExchangeProductIds.has(productId),
    );
    if (missingExchangeProductIds.length > 0) {
      throw new AppError(400, `Products not found: ${missingExchangeProductIds.join(', ')}`);
    }

    for (const ret of returnedItems) {
      const originalItem = originalSale.sale_items.find((item) => item.product_id === ret.productId);
      if (!originalItem) {
        throw new AppError(400, `Product ${ret.productId} not found in original sale`);
      }
      const purchased = originalItem.quantity.toNumber();
      const prior = alreadyReturned.get(ret.productId) || 0;
      const remaining = purchased - prior;
      if (ret.quantity > remaining) {
        throw new AppError(
          400,
          `Return quantity (${ret.quantity}) exceeds remaining returnable quantity (${remaining}) for this product`,
        );
      }
    }

    const stockQuantityMap = new Map<string, Prisma.Decimal>(
      stocks.map((stock) => [stock.product_id, new Prisma.Decimal(stock.current_quantity)]),
    );

    // Exchange replacement items decrement stock like a sale. Do not block when
    // stock is missing or insufficient — same policy as createSale (negative OK).

    type MovementRow = {
      product_id: string;
      movement_type: StockMovementType;
      quantity_change: Prisma.Decimal;
      previous_qty: Prisma.Decimal;
      new_qty: Prisma.Decimal;
      reference_type: string;
      notes: string;
    };

    const saleItems: Prisma.SaleItemUncheckedCreateWithoutSaleInput[] = [];
    const movementRows: MovementRow[] = [];
    const stockNetChanges = new Map<string, Prisma.Decimal>();
    let total = new Prisma.Decimal(0);
    let returnValue = new Prisma.Decimal(0);
    let exchangeValue = new Prisma.Decimal(0);
    const itemDispositions: Record<string, string> = {};

    const recordMovement = ({
      productId,
      change,
      movementType,
      referenceType,
      notes: movementNote,
    }: {
      productId: string;
      change: Prisma.Decimal;
      movementType: StockMovementType;
      referenceType: string;
      notes: string;
    }) => {
      const previousQty = stockQuantityMap.get(productId) ?? new Prisma.Decimal(0);
      const newQty = previousQty.plus(change);

      stockQuantityMap.set(productId, newQty);
      stockNetChanges.set(
        productId,
        (stockNetChanges.get(productId) ?? new Prisma.Decimal(0)).plus(change),
      );
      movementRows.push({
        product_id: productId,
        movement_type: movementType,
        quantity_change: change,
        previous_qty: previousQty,
        new_qty: newQty,
        reference_type: referenceType,
        notes: movementNote,
      });
    };

    // Prorate the original order-level discount across returned items so the
    // refund reflects what the customer actually paid, not the pre-discount
    // line totals. e.g. sold Rs 430 of goods with a Rs 30 order discount ->
    // customer paid Rs 400, so a full return must refund Rs 400 (not Rs 430).
    let originalNetSubtotal = new Prisma.Decimal(originalSale.subtotal || 0);
    if (!originalNetSubtotal.greaterThan(0)) {
      originalNetSubtotal = originalSale.sale_items.reduce(
        (sum, item) => sum.plus(new Prisma.Decimal(item.line_total)),
        new Prisma.Decimal(0),
      );
    }
    const originalOrderDiscount = new Prisma.Decimal(originalSale.discount_amount || 0);
    const discountFactor =
      originalNetSubtotal.greaterThan(0) && originalOrderDiscount.greaterThan(0)
        ? originalNetSubtotal.minus(originalOrderDiscount).div(originalNetSubtotal)
        : new Prisma.Decimal(1);

    for (const ret of returnedItems) {
      const originalItem = originalSale.sale_items.find((item) => item.product_id === ret.productId);
      if (!originalItem) {
        throw new AppError(400, `Product ${ret.productId} not in original sale`);
      }

      const disposition = ret.disposition || 'RESTOCK';
      itemDispositions[ret.productId] = disposition;

      const returnQuantity = new Prisma.Decimal(ret.quantity);
      // Effective per-unit price the customer actually paid: the original line
      // net (after any per-line discount) prorated for the order-level discount.
      const originalQty = new Prisma.Decimal(originalItem.quantity);
      const perUnitPaid = originalQty.greaterThan(0)
        ? new Prisma.Decimal(originalItem.line_total).div(originalQty).mul(discountFactor)
        : new Prisma.Decimal(originalItem.unit_price).mul(discountFactor);
      const lineTotal = perUnitPaid.mul(returnQuantity).mul(-1);
      total = total.plus(lineTotal);
      returnValue = returnValue.plus(lineTotal.abs());

      if (disposition === 'RESTOCK') {
        recordMovement({
          productId: ret.productId,
          change: returnQuantity,
          movementType: StockMovementType.RETURN,
          referenceType: resolvedType === 'EXCHANGE' ? 'exchange' : 'return',
          notes: `Returned by customer (${disposition.toLowerCase()})`,
        });
      }

      saleItems.push({
        product_id: ret.productId,
        quantity: returnQuantity.mul(-1),
        unit_price: perUnitPaid,
        tax_rate: originalItem.tax_rate,
        discount_rate: originalItem.discount_rate,
        tax_amount: new Prisma.Decimal(0),
        discount_amount: new Prisma.Decimal(0),
        line_total: lineTotal,
        item_type: SaleItemType.RETURN,
        ref_sale_item_id: originalItem.id,
      });
    }

    for (const item of exchangedItems) {
      const exchangeQuantity = new Prisma.Decimal(item.quantity);
      const unitPrice = new Prisma.Decimal(item.price);
      const lineTotal = unitPrice.mul(exchangeQuantity);
      total = total.plus(lineTotal);
      exchangeValue = exchangeValue.plus(lineTotal);

      recordMovement({
        productId: item.productId,
        change: exchangeQuantity.mul(-1),
        movementType: StockMovementType.SALE,
        referenceType: 'exchange',
        notes: 'Exchanged to customer',
      });

      saleItems.push({
        product_id: item.productId,
        quantity: exchangeQuantity,
        unit_price: unitPrice,
        tax_rate: new Prisma.Decimal(0),
        discount_rate: new Prisma.Decimal(0),
        tax_amount: new Prisma.Decimal(0),
        discount_amount: new Prisma.Decimal(0),
        line_total: lineTotal,
        item_type: SaleItemType.EXCHANGE,
      });
    }

    const balanceDue = total.toNumber();
    const inferredScope =
      returnScope ||
      (returnedItems.every((ret) => {
        const originalItem = originalSale.sale_items.find((i) => i.product_id === ret.productId);
        if (!originalItem) return false;
        const prior = alreadyReturned.get(ret.productId) || 0;
        return ret.quantity >= originalItem.quantity.toNumber() - prior;
      }) &&
      originalSale.sale_items.every((orig) => {
        const retQty = returnedItems.find((r) => r.productId === orig.product_id)?.quantity || 0;
        const prior = alreadyReturned.get(orig.product_id) || 0;
        return retQty >= orig.quantity.toNumber() - prior;
      })
        ? 'FULL'
        : 'PARTIAL');

    const mapRefundMethod = (method?: string): PaymentMethod => {
      switch (method) {
        case 'cash':
          return PaymentMethod.CASH;
        case 'card':
          return PaymentMethod.CARD;
        case 'bank_transfer':
          return PaymentMethod.BANK_TRANSFER;
        case 'store_credit':
          return PaymentMethod.CREDIT;
        case 'original_payment':
          return originalSale.payment_method;
        case 'no_refund':
          return originalSale.payment_method;
        default:
          return PaymentMethod.CASH;
      }
    };

    const meta = {
      transactionType: resolvedType,
      returnScope: inferredScope,
      returnReason: returnReason || null,
      refundMethod: refundMethod || null,
      exchangeBalanceAction: exchangeBalanceAction || null,
      status: 'COMPLETED',
      returnValue: returnValue.toNumber(),
      exchangeValue: exchangeValue.toNumber(),
      balanceDue,
      itemDispositions,
    };
    const structuredNotes = `__META__${JSON.stringify(meta)}__ENDMETA__\n${notes || ''}`.trim();

    const childStatus =
      resolvedType === 'EXCHANGE' ? SaleStatus.EXCHANGED : SaleStatus.REFUNDED;

    const ops: Prisma.PrismaPromise<any>[] = [];
    ops.push(
      prisma.sale.create({
        data: {
          sale_number: `RTN-${Date.now()}`,
          branch_id: resolvedBranchId,
          customer_id: customerId || originalSale.customer_id,
          original_sale_id: originalSaleId,
          notes: structuredNotes,
          subtotal: total,
          total_amount: total,
          payment_method: mapRefundMethod(refundMethod),
          payment_status: 'PAID',
          status: childStatus,
          created_by: createdBy,
          salesperson_id: originalSale.salesperson_id ?? null,
          sale_items: {
            create: saleItems,
          },
        },
        include: {
          sale_items: { include: { product: true } },
          customer: true,
          original_sale: { select: { sale_number: true, total_amount: true } },
        },
      }),
    );

    let allFullyReturned = true;
    for (const orig of originalSale.sale_items) {
      const retThisTxn =
        returnedItems.find((r) => r.productId === orig.product_id)?.quantity || 0;
      const prior = alreadyReturned.get(orig.product_id) || 0;
      if (prior + retThisTxn < orig.quantity.toNumber()) {
        allFullyReturned = false;
        break;
      }
    }

    const originalNewStatus = allFullyReturned
      ? resolvedType === 'EXCHANGE'
        ? SaleStatus.EXCHANGED
        : SaleStatus.REFUNDED
      : SaleStatus.COMPLETED;

    ops.push(
      prisma.sale.update({
        where: { id: originalSaleId },
        data: { status: originalNewStatus },
      }),
    );

    for (const [productId, quantityChange] of stockNetChanges.entries()) {
      if (quantityChange.isZero()) continue;
      ops.push(
        prisma.stock.upsert({
          where: {
            product_id_branch_id: {
              product_id: productId,
              branch_id: resolvedBranchId,
            },
          },
          update: {
            current_quantity: {
              increment: quantityChange,
            },
          },
          create: {
            product_id: productId,
            branch_id: resolvedBranchId,
            current_quantity: quantityChange,
            minimum_quantity: new Prisma.Decimal(0),
            maximum_quantity: new Prisma.Decimal(1000),
            reserved_quantity: new Prisma.Decimal(0),
          },
        }),
      );
    }

    if (movementRows.length > 0) {
      ops.push(
        prisma.stockMovement.createMany({
          data: movementRows.map((movement) => ({
            product_id: movement.product_id,
            branch_id: resolvedBranchId,
            movement_type: movement.movement_type,
            reference_id: originalSaleId,
            reference_type: movement.reference_type,
            quantity_change: movement.quantity_change,
            previous_qty: movement.previous_qty,
            new_qty: movement.new_qty,
            notes: movement.notes,
            created_by: createdBy,
          })),
        }),
      );
    }

    const [sale] = await prisma.$transaction(ops);
    return sale as Prisma.SaleGetPayload<{
      include: { sale_items: { include: { product: true } }; customer: true };
    }>;
  }

  /**
   * Most recent sales (one row per sale, not per line item) so the dashboard
   * "Recent Sales" widget shows real recent activity instead of just the
   * line items of whichever single sale happened to be most recent.
   */
  async getRecentSales(branchId?: string, limit = 10) {
    const sales = await prisma.sale.findMany({
      where: branchId ? { branch_id: branchId } : undefined,
      orderBy: { sale_date: 'desc' },
      take: limit,
      select: {
        id: true,
        sale_number: true,
        total_amount: true,
        status: true,
        payment_method: true,
        sale_date: true,
        customer: { select: { name: true } },
        branch: { select: { id: true, name: true } },
        sale_items: {
          take: 1,
          select: { product: { select: { name: true } } },
        },
      },
    });

    return sales.map((sale) => ({
      id: sale.id,
      saleNumber: sale.sale_number,
      totalAmount: sale.total_amount,
      status: sale.status,
      paymentMethod: sale.payment_method,
      saleDate: sale.sale_date,
      customerName: sale.customer?.name || 'Walk-in Customer',
      branch: sale.branch,
      productName: sale.sale_items[0]?.product?.name || null,
    }));
  }
}
export { SaleService };
