import { TransferStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { addDecimal, asNumber } from '../utils/helpers';
import { Prisma } from '@prisma/client';

function generateTransferRef(): string {
  return `TRF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export class TransferService {
  async createTransfer(data: {
    productId: string;
    quantity: number;
    fromBranchId: string;
    toBranchId: string;
    notes?: string;
    createdBy: string;
    reason?: string;
    carrierName?: string;
    vehicleNo?: string;
    estimatedArrival?: string | Date;
    receiverName?: string;
  }) {
    if (data.fromBranchId === data.toBranchId) {
      throw new AppError(400, 'Cannot transfer to the same location');
    }
    if (data.quantity <= 0) {
      throw new AppError(400, 'Quantity must be greater than 0');
    }

    return prisma.$transaction(async (tx) => {
      const sourceStock = await tx.stock.findUnique({
        where: {
          product_id_branch_id: {
            product_id: data.productId,
            branch_id: data.fromBranchId,
          },
        },
      });

      if (!sourceStock) {
        throw new AppError(404, 'Source stock not found');
      }

      const sourceQty = asNumber(sourceStock.current_quantity);
      if (sourceQty < data.quantity) {
        throw new AppError(400, 'Insufficient stock for transfer');
      }

      const referenceNo = generateTransferRef();
      const transfer = await tx.transfer.create({
        data: {
          product_id: data.productId,
          quantity: data.quantity,
          from_branch_id: data.fromBranchId,
          to_branch_id: data.toBranchId,
          status: 'PENDING',
          reference_no: referenceNo,
          reason: data.reason || 'Stock Replenishment',
          carrier_name: data.carrierName,
          vehicle_no: data.vehicleNo,
          estimated_arrival: data.estimatedArrival,
          receiver_name: data.receiverName,
          notes: data.notes,
          created_by: data.createdBy,
        },
        include: {
          product: true,
          from_branch: true,
          to_branch: true,
          user: { select: { email: true } },
        },
      });

      const newSourceQty = addDecimal(sourceStock.current_quantity, -data.quantity);
      await tx.stock.update({
        where: {
          product_id_branch_id: {
            product_id: data.productId,
            branch_id: data.fromBranchId,
          },
        },
        data: { current_quantity: newSourceQty },
      });

      // Stock leaves the source now and is "in transit" until the destination
      // receives it (see updateTransferStatus). It used to be credited to the
      // destination immediately, so Dispatch/Receive were labels only.
      await tx.stockMovement.create({
        data: {
          product_id: data.productId,
          branch_id: data.fromBranchId,
          movement_type: 'TRANSFER_OUT',
          reference_id: transfer.id,
          reference_type: 'transfer',
          quantity_change: -data.quantity,
          previous_qty: sourceStock.current_quantity,
          new_qty: newSourceQty,
          notes: `Transfer to ${transfer.to_branch?.name || data.toBranchId} - ${referenceNo}`,
          created_by: data.createdBy,
        },
      });

      return transfer;
    });
  }

  /** Has the destination already been credited for this transfer? (older
   *  transfers credited it at creation time). */
  private async destinationCredited(tx: Prisma.TransactionClient, transferId: string, toBranchId: string) {
    const movement = await tx.stockMovement.findFirst({
      where: {
        reference_id: transferId,
        reference_type: 'transfer',
        movement_type: 'TRANSFER_IN',
        branch_id: toBranchId,
      },
      select: { id: true },
    });
    return Boolean(movement);
  }

  private async changeStock(
    tx: Prisma.TransactionClient,
    params: {
      productId: string;
      branchId: string;
      delta: number;
      movementType: 'TRANSFER_IN' | 'TRANSFER_OUT';
      referenceId: string;
      referenceType: string;
      notes: string;
      userId?: string;
    },
  ) {
    const existing = await tx.stock.findUnique({
      where: { product_id_branch_id: { product_id: params.productId, branch_id: params.branchId } },
    });
    const previous = existing ? existing.current_quantity : new Prisma.Decimal(0);
    const next = addDecimal(previous, params.delta);
    if (existing) {
      await tx.stock.update({
        where: { product_id_branch_id: { product_id: params.productId, branch_id: params.branchId } },
        data: { current_quantity: next },
      });
    } else {
      await tx.stock.create({
        data: { product_id: params.productId, branch_id: params.branchId, current_quantity: next },
      });
    }
    await tx.stockMovement.create({
      data: {
        product_id: params.productId,
        branch_id: params.branchId,
        movement_type: params.movementType,
        reference_id: params.referenceId,
        reference_type: params.referenceType,
        quantity_change: params.delta,
        previous_qty: previous,
        new_qty: next,
        notes: params.notes,
        created_by: params.userId,
      },
    });
  }

  async updateTransferStatus(
    id: string,
    status: TransferStatus,
    userId?: string
  ) {
    const ALLOWED: Record<string, TransferStatus[]> = {
      PENDING: ['DISPATCHED', 'RECEIVED', 'CANCELLED'],
      DISPATCHED: ['RECEIVED', 'CANCELLED'],
      RECEIVED: [],
      CANCELLED: [],
    };

    return prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findUnique({
        where: { id },
        include: { product: true, from_branch: true, to_branch: true },
      });
      if (!transfer) throw new AppError(404, 'Transfer not found');
      if (transfer.status === status) return tx.transfer.findUnique({
        where: { id },
        include: { product: true, from_branch: true, to_branch: true, user: { select: { email: true } } },
      });
      if (!(ALLOWED[transfer.status] || []).includes(status)) {
        throw new AppError(
          400,
          `A ${transfer.status.toLowerCase()} transfer cannot be marked ${status.toLowerCase()}`,
        );
      }

      const qty = asNumber(transfer.quantity);
      const ref = transfer.reference_no || transfer.id;
      const credited = await this.destinationCredited(tx, transfer.id, transfer.to_branch_id);

      if (status === 'RECEIVED' && !credited) {
        await this.changeStock(tx, {
          productId: transfer.product_id,
          branchId: transfer.to_branch_id,
          delta: qty,
          movementType: 'TRANSFER_IN',
          referenceId: transfer.id,
          referenceType: 'transfer',
          notes: `Received from ${transfer.from_branch?.name || transfer.from_branch_id} - ${ref}`,
          userId,
        });
      }

      if (status === 'CANCELLED') {
        // Return the goods to the source branch...
        await this.changeStock(tx, {
          productId: transfer.product_id,
          branchId: transfer.from_branch_id,
          delta: qty,
          movementType: 'TRANSFER_IN',
          referenceId: transfer.id,
          referenceType: 'transfer_cancel',
          notes: `Transfer cancelled - returned to source - ${ref}`,
          userId,
        });
        // ...and undo the destination credit on older transfers.
        if (credited) {
          await this.changeStock(tx, {
            productId: transfer.product_id,
            branchId: transfer.to_branch_id,
            delta: -qty,
            movementType: 'TRANSFER_OUT',
            referenceId: transfer.id,
            referenceType: 'transfer_cancel',
            notes: `Transfer cancelled - reversed at destination - ${ref}`,
            userId,
          });
        }
      }

      const updateData: Prisma.TransferUpdateInput = { status };
      if (status === 'RECEIVED') {
        updateData.received_at = new Date();
        if (userId) (updateData as any).received_by = userId;
      }

      return tx.transfer.update({
        where: { id },
        data: updateData,
        include: {
          product: true,
          from_branch: true,
          to_branch: true,
          user: { select: { email: true } },
        },
      });
    });
  }

  async listTransfers(params: {
    page?: number;
    limit?: number;
    fromBranchId?: string;
    toBranchId?: string;
    productId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    branchId?: string;
    search?: string;
  }) {
    const page = Math.max(params.page || 1, 1);
    const limit = Math.min(Math.max(params.limit || 20, 1), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.TransferWhereInput = {};
    if (params.fromBranchId) where.from_branch_id = params.fromBranchId;
    if (params.toBranchId) where.to_branch_id = params.toBranchId;
    if (params.productId) where.product_id = params.productId;
    const and: Prisma.TransferWhereInput[] = [];
    if (params.branchId) {
      and.push({ OR: [{ from_branch_id: params.branchId }, { to_branch_id: params.branchId }] });
    }
    const search = params.search?.trim();
    if (search) {
      and.push({
        OR: [
          { reference_no: { contains: search, mode: 'insensitive' } },
          { carrier_name: { contains: search, mode: 'insensitive' } },
          { vehicle_no: { contains: search, mode: 'insensitive' } },
          { product: { name: { contains: search, mode: 'insensitive' } } },
          { product: { sku: { contains: search, mode: 'insensitive' } } },
          { from_branch: { name: { contains: search, mode: 'insensitive' } } },
          { to_branch: { name: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }
    if (and.length) where.AND = and;
    if (params.startDate || params.endDate) {
      where.transfer_date = {};
      if (params.startDate) where.transfer_date.gte = params.startDate;
      if (params.endDate) where.transfer_date.lte = params.endDate;
    }

    // Status counts ignore the status filter so the chips/cards show the
    // whole picture for the other filters.
    const listWhere: Prisma.TransferWhereInput = params.status
      ? { ...where, status: params.status as any }
      : where;

    const [total, transfers, byStatus, inTransit] = await Promise.all([
      prisma.transfer.count({ where: listWhere }),
      prisma.transfer.findMany({
        where: listWhere,
        skip,
        take: limit,
        orderBy: { transfer_date: 'desc' },
        include: {
          product: true,
          from_branch: true,
          to_branch: true,
          user: { select: { email: true } },
        },
      }),
      prisma.transfer.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.transfer.aggregate({
        where: { ...where, status: { in: ['PENDING', 'DISPATCHED'] } },
        _sum: { quantity: true },
      }),
    ]);

    const statusCounts: Record<string, number> = { PENDING: 0, DISPATCHED: 0, RECEIVED: 0, CANCELLED: 0 };
    for (const row of byStatus) statusCounts[row.status] = row._count._all;

    return {
      data: transfers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        statusCounts,
        allCount: Object.values(statusCounts).reduce((a, b) => a + b, 0),
        unitsInTransit: asNumber(inTransit._sum.quantity || 0),
      },
    };
  }

  async getTransferById(id: string) {
    const transfer = await prisma.transfer.findUnique({
      where: { id },
      include: {
        product: true,
        from_branch: true,
        to_branch: true,
        user: { select: { email: true } },
      },
    });
    if (!transfer) throw new AppError(404, 'Transfer not found');
    return transfer;
  }

  async getPendingTransfers(branchId?: string) {
    const where: Prisma.TransferWhereInput = {
      status: { in: ['PENDING', 'DISPATCHED'] },
    };
    if (branchId) {
      where.OR = [
        { from_branch_id: branchId },
        { to_branch_id: branchId },
      ];
    }
    return prisma.transfer.findMany({
      where,
      orderBy: { transfer_date: 'desc' },
      include: {
        product: true,
        from_branch: true,
        to_branch: true,
      },
    });
  }
}
