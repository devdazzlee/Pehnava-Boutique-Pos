import { Prisma, PurchaseReturnStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { asNumber } from '../utils/helpers';
import { parsePagination, paginationMeta } from '../utils/pagination';
import { parseOptionalDateRange } from '../utils/timezone';

const PR_INCLUDE = {
    supplier: { select: { id: true, name: true, code: true } },
    branch: { select: { id: true, name: true } },
    user: { select: { id: true, email: true } },
    items: {
        include: { product: { select: { id: true, name: true, sku: true, code: true } } },
    },
} satisfies Prisma.PurchaseReturnInclude;

function returnNumber() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
        d.getDate(),
    ).padStart(2, '0')}`;
    return `PRN-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

interface CreatePRInput {
    supplier_id: string;
    branch_id: string;
    return_date?: string;
    reason?: string | null;
    notes?: string | null;
    items: {
        product_id: string;
        quantity: number;
        unit_cost: number;
        purchase_id?: string | null;
    }[];
}

export class PurchaseReturnService {
    async list(q: {
        page?: unknown;
        limit?: unknown;
        supplier_id?: string;
        branch_id?: string;
        status?: string;
        from?: string;
        to?: string;
    }) {
        const { page, limit, skip } = parsePagination({ page: q.page, limit: q.limit });
        const where: Prisma.PurchaseReturnWhereInput = {};
        if (q.supplier_id) where.supplier_id = q.supplier_id;
        if (q.branch_id) where.branch_id = q.branch_id;
        if (q.status && q.status in PurchaseReturnStatus) {
            where.status = q.status as PurchaseReturnStatus;
        }
        const { start, end } = parseOptionalDateRange(q.from, q.to);
        if (start || end) {
            where.return_date = {};
            if (start) where.return_date.gte = start;
            if (end) where.return_date.lte = end;
        }

        const [rows, total, agg] = await Promise.all([
            prisma.purchaseReturn.findMany({
                where,
                orderBy: { return_date: 'desc' },
                skip,
                take: limit,
                include: PR_INCLUDE,
            }),
            prisma.purchaseReturn.count({ where }),
            prisma.purchaseReturn.aggregate({ where, _sum: { total_amount: true } }),
        ]);

        return {
            data: rows.map(this.shape),
            meta: {
                ...paginationMeta(total, page, limit),
                summary: { totalReturned: asNumber(agg._sum.total_amount) },
            },
        };
    }

    async getById(id: string) {
        const pr = await prisma.purchaseReturn.findUnique({ where: { id }, include: PR_INCLUDE });
        if (!pr) throw new AppError(404, 'Purchase return not found');
        return this.shape(pr);
    }

    private shape = (pr: Prisma.PurchaseReturnGetPayload<{ include: typeof PR_INCLUDE }>) => ({
        ...pr,
        total_amount: asNumber(pr.total_amount),
        items: pr.items.map((it) => ({
            ...it,
            quantity: asNumber(it.quantity),
            unit_cost: asNumber(it.unit_cost),
            total_cost: asNumber(it.total_cost),
        })),
    });

    async create(data: CreatePRInput, userId: string) {
        if (!data.items?.length) throw new AppError(400, 'A purchase return needs at least one line');
        for (const it of data.items) {
            if (it.quantity <= 0) throw new AppError(400, 'Return quantity must be positive');
        }

        const [supplier, branch] = await Promise.all([
            prisma.supplier.findUnique({ where: { id: data.supplier_id } }),
            prisma.branch.findUnique({ where: { id: data.branch_id } }),
        ]);
        if (!supplier) throw new AppError(400, 'Invalid supplier');
        if (!branch) throw new AppError(400, 'Invalid branch');

        const total = data.items.reduce(
            (acc, it) => acc + Number(it.quantity) * Number(it.unit_cost),
            0,
        );

        const created = await prisma.$transaction(async (tx) => {
            const pr = await tx.purchaseReturn.create({
                data: {
                    return_number: returnNumber(),
                    supplier_id: data.supplier_id,
                    branch_id: data.branch_id,
                    return_date: data.return_date ? new Date(data.return_date) : new Date(),
                    status: 'COMPLETED',
                    reason: data.reason ?? null,
                    notes: data.notes ?? null,
                    total_amount: new Prisma.Decimal(total),
                    created_by: userId,
                    items: {
                        create: data.items.map((it) => ({
                            product_id: it.product_id,
                            quantity: new Prisma.Decimal(it.quantity),
                            unit_cost: new Prisma.Decimal(it.unit_cost),
                            total_cost: new Prisma.Decimal(Number(it.quantity) * Number(it.unit_cost)),
                            purchase_id: it.purchase_id ?? null,
                        })),
                    },
                },
                include: PR_INCLUDE,
            });

            for (const it of data.items) {
                const stock = await tx.stock.findUnique({
                    where: {
                        product_id_branch_id: {
                            product_id: it.product_id,
                            branch_id: data.branch_id,
                        },
                    },
                });
                const previousQty = stock ? asNumber(stock.current_quantity) : 0;
                const newQty = previousQty - it.quantity;
                if (stock) {
                    await tx.stock.update({
                        where: {
                            product_id_branch_id: {
                                product_id: it.product_id,
                                branch_id: data.branch_id,
                            },
                        },
                        data: { current_quantity: new Prisma.Decimal(newQty) },
                    });
                } else {
                    await tx.stock.create({
                        data: {
                            product_id: it.product_id,
                            branch_id: data.branch_id,
                            current_quantity: new Prisma.Decimal(newQty),
                        },
                    });
                }

                await tx.stockMovement.create({
                    data: {
                        product_id: it.product_id,
                        branch_id: data.branch_id,
                        movement_type: 'PURCHASE_RETURN',
                        reference_id: pr.id,
                        reference_type: 'purchase_return',
                        quantity_change: new Prisma.Decimal(-it.quantity),
                        previous_qty: new Prisma.Decimal(previousQty),
                        new_qty: new Prisma.Decimal(newQty),
                        unit_cost: new Prisma.Decimal(it.unit_cost),
                        notes: `Return ${pr.return_number}`,
                        created_by: userId,
                    },
                });
            }

            return pr;
        });

        return this.shape(created);
    }

    /** Cancel a return and put the stock back. */
    async cancel(id: string, userId: string) {
        const pr = await prisma.purchaseReturn.findUnique({ where: { id }, include: { items: true } });
        if (!pr) throw new AppError(404, 'Purchase return not found');
        if (pr.status === 'CANCELLED') return this.getById(id);

        await prisma.$transaction(async (tx) => {
            for (const it of pr.items) {
                const qty = asNumber(it.quantity);
                const stock = await tx.stock.findUnique({
                    where: {
                        product_id_branch_id: { product_id: it.product_id, branch_id: pr.branch_id },
                    },
                });
                const previousQty = stock ? asNumber(stock.current_quantity) : 0;
                const newQty = previousQty + qty;
                if (stock) {
                    await tx.stock.update({
                        where: {
                            product_id_branch_id: { product_id: it.product_id, branch_id: pr.branch_id },
                        },
                        data: { current_quantity: new Prisma.Decimal(newQty) },
                    });
                } else {
                    await tx.stock.create({
                        data: {
                            product_id: it.product_id,
                            branch_id: pr.branch_id,
                            current_quantity: new Prisma.Decimal(newQty),
                        },
                    });
                }
                await tx.stockMovement.create({
                    data: {
                        product_id: it.product_id,
                        branch_id: pr.branch_id,
                        movement_type: 'PURCHASE_RETURN',
                        reference_id: pr.id,
                        reference_type: 'purchase_return_cancel',
                        quantity_change: new Prisma.Decimal(qty),
                        previous_qty: new Prisma.Decimal(previousQty),
                        new_qty: new Prisma.Decimal(newQty),
                        unit_cost: new Prisma.Decimal(asNumber(it.unit_cost)),
                        notes: `Cancelled return ${pr.return_number}`,
                        created_by: userId,
                    },
                });
            }
            await tx.purchaseReturn.update({ where: { id }, data: { status: 'CANCELLED' } });
        });

        return this.getById(id);
    }
}
