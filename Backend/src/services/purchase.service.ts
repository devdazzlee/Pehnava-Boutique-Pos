import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { addDecimal, asNumber } from '../utils/helpers';
import { Prisma } from '@prisma/client';
import { startOfBusinessMonth } from '../utils/timezone';
import { randomUUID } from 'crypto';

const PURCHASE_LIST_INCLUDE = {
  product: true,
  supplier: true,
  warehouse_branch: true,
  user: { select: { email: true } },
} satisfies Prisma.PurchaseInclude;

type PurchaseListRow = Prisma.PurchaseGetPayload<{ include: typeof PURCHASE_LIST_INCLUDE }>;

function billKey(p: {
  id: string;
  bill_group_id?: string | null;
  supplier_id: string;
  warehouse_branch_id: string;
  invoice_ref?: string | null;
  purchase_date: Date;
}) {
  if (p.bill_group_id) return p.bill_group_id;
  // Legacy rows without a group: keep each line as its own bill unless invoice_ref ties them.
  const inv = (p.invoice_ref || '').trim();
  if (inv) {
    const day = p.purchase_date.toISOString().slice(0, 10);
    return `legacy:${p.supplier_id}|${p.warehouse_branch_id}|${inv}|${day}`;
  }
  return `solo:${p.id}`;
}

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
      const billGroupId = randomUUID();
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
          bill_group_id: billGroupId,
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
      const billGroupId = randomUUID();

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
            bill_group_id: billGroupId,
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
        billGroupId,
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
    search?: string;
    /** line = each product row (default). bill = one row per supplier receipt. */
    groupBy?: 'line' | 'bill';
  }) {
    const page = Math.max(params.page || 1, 1);
    const limit = Math.min(Math.max(params.limit || 20, 1), 100);
    const skip = (page - 1) * limit;
    const groupBy = params.groupBy === 'bill' ? 'bill' : 'line';

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
    const search = params.search?.trim();
    if (search) {
      where.OR = [
        { invoice_ref: { contains: search, mode: 'insensitive' } },
        { product: { name: { contains: search, mode: 'insensitive' } } },
        { product: { sku: { contains: search, mode: 'insensitive' } } },
        { product: { code: { contains: search, mode: 'insensitive' } } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const totalsRows = await prisma.purchase.findMany({
      where,
      select: { quantity: true, cost_price: true },
    });
    let totalQuantity = 0;
    let totalValue = 0;
    for (const row of totalsRows) {
      const qty = Number(row.quantity) || 0;
      totalQuantity += qty;
      totalValue += qty * (Number(row.cost_price) || 0);
    }
    const totalsMeta = {
      totalQuantity: Math.round(totalQuantity * 100) / 100,
      totalValue: Math.round(totalValue * 100) / 100,
    };

    if (groupBy === 'line') {
      const [total, purchases] = await Promise.all([
        prisma.purchase.count({ where }),
        prisma.purchase.findMany({
          where,
          skip,
          take: limit,
          orderBy: { purchase_date: 'desc' },
          include: PURCHASE_LIST_INCLUDE,
        }),
      ]);
      return {
        data: purchases,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          groupBy: 'line' as const,
          ...totalsMeta,
        },
      };
    }

    // Bill-wise: load matching lines, group, then paginate groups.
    const allLines = await prisma.purchase.findMany({
      where,
      orderBy: { purchase_date: 'desc' },
      include: PURCHASE_LIST_INCLUDE,
      take: 5000,
    });

    const groupMap = new Map<
      string,
      {
        bill_group_id: string;
        purchase_date: Date;
        invoice_ref: string | null;
        supplier: PurchaseListRow['supplier'];
        warehouse_branch: PurchaseListRow['warehouse_branch'];
        user: PurchaseListRow['user'];
        delivery_status: string | null;
        lines: PurchaseListRow[];
        quantity: number;
        value: number;
      }
    >();

    for (const row of allLines) {
      const key = billKey(row);
      const qty = Number(row.quantity) || 0;
      const cost = Number(row.cost_price) || 0;
      const existing = groupMap.get(key);
      if (existing) {
        existing.lines.push(row);
        existing.quantity += qty;
        existing.value += qty * cost;
        if (row.purchase_date > existing.purchase_date) {
          existing.purchase_date = row.purchase_date;
        }
      } else {
        groupMap.set(key, {
          bill_group_id: key,
          purchase_date: row.purchase_date,
          invoice_ref: row.invoice_ref,
          supplier: row.supplier,
          warehouse_branch: row.warehouse_branch,
          user: row.user,
          delivery_status: row.delivery_status,
          lines: [row],
          quantity: qty,
          value: qty * cost,
        });
      }
    }

    const bills = Array.from(groupMap.values()).sort(
      (a, b) => b.purchase_date.getTime() - a.purchase_date.getTime(),
    );
    const total = bills.length;
    const pageBills = bills.slice(skip, skip + limit).map((b) => ({
      id: b.lines[0]?.id,
      bill_group_id: b.bill_group_id,
      purchase_date: b.purchase_date,
      invoice_ref: b.invoice_ref,
      supplier: b.supplier,
      warehouse_branch: b.warehouse_branch,
      user: b.user,
      delivery_status: b.delivery_status,
      line_count: b.lines.length,
      quantity: Math.round(b.quantity * 100) / 100,
      cost_price: b.quantity > 0 ? Math.round((b.value / b.quantity) * 100) / 100 : 0,
      value: Math.round(b.value * 100) / 100,
      product: {
        id: b.lines[0]?.product_id,
        name:
          b.lines.length === 1
            ? b.lines[0]?.product?.name || '—'
            : `${b.lines.length} products`,
        sku: b.lines.length === 1 ? b.lines[0]?.product?.sku : null,
      },
      lines: b.lines.map((l) => ({
        id: l.id,
        product: l.product,
        quantity: Number(l.quantity) || 0,
        cost_price: Number(l.cost_price) || 0,
        value: (Number(l.quantity) || 0) * (Number(l.cost_price) || 0),
      })),
    }));

    return {
      data: pageBills,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        groupBy: 'bill' as const,
        ...totalsMeta,
      },
    };
  }

  async getPurchaseById(id: string) {
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: PURCHASE_LIST_INCLUDE,
    });
    if (!purchase) throw new AppError(404, 'Purchase not found');

    const groupId = purchase.bill_group_id;
    let billLines = [purchase];
    if (groupId) {
      billLines = await prisma.purchase.findMany({
        where: { bill_group_id: groupId },
        orderBy: { created_at: 'asc' },
        include: PURCHASE_LIST_INCLUDE,
      });
    } else {
      const inv = (purchase.invoice_ref || '').trim();
      if (inv) {
        const dayStart = new Date(purchase.purchase_date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(purchase.purchase_date);
        dayEnd.setHours(23, 59, 59, 999);
        billLines = await prisma.purchase.findMany({
          where: {
            supplier_id: purchase.supplier_id,
            warehouse_branch_id: purchase.warehouse_branch_id,
            invoice_ref: purchase.invoice_ref,
            purchase_date: { gte: dayStart, lte: dayEnd },
          },
          orderBy: { created_at: 'asc' },
          include: PURCHASE_LIST_INCLUDE,
        });
      }
    }

    const billQuantity = billLines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
    const billValue = billLines.reduce(
      (s, l) => s + (Number(l.quantity) || 0) * (Number(l.cost_price) || 0),
      0,
    );

    return {
      ...purchase,
      bill_group_id: groupId || billKey(purchase),
      bill_lines: billLines,
      bill_line_count: billLines.length,
      bill_quantity: Math.round(billQuantity * 100) / 100,
      bill_value: Math.round(billValue * 100) / 100,
    };
  }

  /**
   * Correct a Stock In line: qty/cost/meta. Quantity changes adjust on-hand stock
   * by the delta and write an ADJUSTMENT movement linked to the purchase.
   */
  async updatePurchase(
    id: string,
    data: {
      quantity?: number;
      costPrice?: number;
      salePrice?: number;
      purchaseDate?: Date;
      invoiceRef?: string | null;
      notes?: string | null;
      deliveryStatus?: 'PARTIAL' | 'COMPLETE';
      updatedBy: string;
    },
  ) {
    const existing = await prisma.purchase.findUnique({
      where: { id },
      include: {
        return_items: { select: { quantity: true } },
      },
    });
    if (!existing) throw new AppError(404, 'Purchase not found');

    const oldQty = asNumber(existing.quantity);
    const returnedQty = existing.return_items.reduce(
      (s, r) => s + asNumber(r.quantity),
      0,
    );

    const nextQty =
      data.quantity !== undefined ? Number(data.quantity) : oldQty;
    if (!Number.isFinite(nextQty) || nextQty <= 0) {
      throw new AppError(400, 'Quantity must be greater than zero');
    }
    if (nextQty < returnedQty) {
      throw new AppError(
        400,
        `Quantity cannot be less than already returned (${returnedQty})`,
      );
    }

    const nextCost =
      data.costPrice !== undefined ? Number(data.costPrice) : asNumber(existing.cost_price);
    if (!Number.isFinite(nextCost) || nextCost < 0) {
      throw new AppError(400, 'Cost price must be >= 0');
    }

    const nextSale =
      data.salePrice !== undefined
        ? Number(data.salePrice)
        : asNumber(existing.sale_price);
    if (!Number.isFinite(nextSale) || nextSale < 0) {
      throw new AppError(400, 'Sale price must be >= 0');
    }

    const qtyDelta = nextQty - oldQty;

    return prisma.$transaction(async (tx) => {
      if (qtyDelta !== 0) {
        let stock = await tx.stock.findUnique({
          where: {
            product_id_branch_id: {
              product_id: existing.product_id,
              branch_id: existing.warehouse_branch_id,
            },
          },
        });

        const previousQty = stock ? asNumber(stock.current_quantity) : 0;
        const newStockQty = previousQty + qtyDelta;
        if (newStockQty < 0) {
          throw new AppError(
            400,
            `Cannot reduce quantity: only ${previousQty} units remain in stock at this branch`,
          );
        }

        if (stock) {
          await tx.stock.update({
            where: {
              product_id_branch_id: {
                product_id: existing.product_id,
                branch_id: existing.warehouse_branch_id,
              },
            },
            data: { current_quantity: newStockQty },
          });
        } else {
          await tx.stock.create({
            data: {
              product_id: existing.product_id,
              branch_id: existing.warehouse_branch_id,
              current_quantity: Math.max(0, newStockQty),
            },
          });
        }

        await tx.stockMovement.create({
          data: {
            product_id: existing.product_id,
            branch_id: existing.warehouse_branch_id,
            movement_type: 'ADJUSTMENT',
            reference_id: existing.id,
            reference_type: 'purchase_edit',
            quantity_change: qtyDelta,
            previous_qty: previousQty,
            new_qty: newStockQty,
            unit_cost: nextCost,
            notes: `Stock In edit: qty ${oldQty} → ${nextQty}`,
            created_by: data.updatedBy,
          },
        });
      }

      const purchase = await tx.purchase.update({
        where: { id },
        data: {
          quantity: nextQty,
          cost_price: nextCost,
          sale_price: nextSale,
          ...(data.purchaseDate !== undefined
            ? { purchase_date: data.purchaseDate }
            : {}),
          ...(data.invoiceRef !== undefined ? { invoice_ref: data.invoiceRef } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.deliveryStatus !== undefined
            ? { delivery_status: data.deliveryStatus }
            : {}),
        },
        include: PURCHASE_LIST_INCLUDE,
      });

      return purchase;
    });
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
