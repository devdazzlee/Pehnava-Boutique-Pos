"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecurringExpenseService = exports.ExpenseService = exports.ExpenseCategoryService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const helpers_1 = require("../utils/helpers");
const pagination_1 = require("../utils/pagination");
const timezone_1 = require("../utils/timezone");
/** Advance a date by one recurrence step. */
function advanceDate(from, frequency, interval) {
    const d = new Date(from);
    const n = Math.max(1, interval);
    switch (frequency) {
        case 'DAILY':
            d.setDate(d.getDate() + n);
            break;
        case 'WEEKLY':
            d.setDate(d.getDate() + n * 7);
            break;
        case 'MONTHLY':
            d.setMonth(d.getMonth() + n);
            break;
        case 'QUARTERLY':
            d.setMonth(d.getMonth() + n * 3);
            break;
        case 'YEARLY':
            d.setFullYear(d.getFullYear() + n);
            break;
    }
    return d;
}
function parseDateInput(value) {
    return (0, timezone_1.parseYmdBound)(value, 'start');
}
const EXPENSE_INCLUDE = {
    category: { select: { id: true, name: true } },
    branch: { select: { id: true, name: true } },
    creator: { select: { id: true, email: true } },
    approver: { select: { id: true, email: true } },
};
/* ============================ categories ============================ */
class ExpenseCategoryService {
    async list(opts) {
        const where = {};
        if (opts?.search?.trim()) {
            where.name = { contains: opts.search.trim(), mode: 'insensitive' };
        }
        if (opts?.is_active !== undefined)
            where.is_active = opts.is_active;
        const rows = await client_2.prisma.expenseCategory.findMany({
            where,
            orderBy: { name: 'asc' },
            include: { _count: { select: { expenses: true, recurring: true } } },
        });
        return rows.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            is_active: c.is_active,
            expense_count: c._count.expenses,
            recurring_count: c._count.recurring,
            created_at: c.created_at,
        }));
    }
    async create(data) {
        const name = data.name.trim();
        const clash = await client_2.prisma.expenseCategory.findFirst({
            where: { name: { equals: name, mode: 'insensitive' } },
        });
        if (clash)
            throw new apiError_1.AppError(400, 'An expense category with this name already exists');
        return client_2.prisma.expenseCategory.create({
            data: {
                name,
                description: data.description?.trim() || null,
                is_active: data.is_active ?? true,
            },
        });
    }
    async update(id, data) {
        const existing = await client_2.prisma.expenseCategory.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Expense category not found');
        const patch = {};
        if (data.name !== undefined) {
            const name = data.name.trim();
            const clash = await client_2.prisma.expenseCategory.findFirst({
                where: { name: { equals: name, mode: 'insensitive' }, NOT: { id } },
            });
            if (clash)
                throw new apiError_1.AppError(400, 'An expense category with this name already exists');
            patch.name = name;
        }
        if (data.description !== undefined)
            patch.description = data.description?.trim() || null;
        if (data.is_active !== undefined)
            patch.is_active = data.is_active;
        return client_2.prisma.expenseCategory.update({ where: { id }, data: patch });
    }
    async toggle(id) {
        const existing = await client_2.prisma.expenseCategory.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Expense category not found');
        return client_2.prisma.expenseCategory.update({
            where: { id },
            data: { is_active: !existing.is_active },
        });
    }
    async remove(id) {
        const cat = await client_2.prisma.expenseCategory.findUnique({
            where: { id },
            include: { _count: { select: { expenses: true, recurring: true } } },
        });
        if (!cat)
            throw new apiError_1.AppError(404, 'Expense category not found');
        if (cat._count.expenses > 0 || cat._count.recurring > 0) {
            throw new apiError_1.AppError(400, `Cannot delete "${cat.name}" — it is used by ${cat._count.expenses} expense(s) and ${cat._count.recurring} recurring template(s). Deactivate it instead.`);
        }
        await client_2.prisma.expenseCategory.delete({ where: { id } });
        return { id: cat.id, name: cat.name };
    }
}
exports.ExpenseCategoryService = ExpenseCategoryService;
/* ============================= expenses ============================= */
class ExpenseService {
    buildWhere(q) {
        const where = {};
        if (q.search?.trim()) {
            const s = q.search.trim();
            where.OR = [
                { particular: { contains: s, mode: 'insensitive' } },
                { vendor: { contains: s, mode: 'insensitive' } },
                { reference: { contains: s, mode: 'insensitive' } },
            ];
        }
        if (q.category_id)
            where.category_id = q.category_id;
        if (q.payment_method)
            where.payment_method = q.payment_method;
        if (q.status)
            where.status = q.status;
        if (q.branch_id)
            where.branch_id = q.branch_id;
        const { start, end } = (0, timezone_1.parseOptionalDateRange)(q.from, q.to);
        if (start || end) {
            where.expense_date = {};
            if (start)
                where.expense_date.gte = start;
            if (end)
                where.expense_date.lte = end;
        }
        return where;
    }
    async list(q) {
        const { page, limit, skip } = (0, pagination_1.parsePagination)({ page: q.page, limit: q.limit });
        const where = this.buildWhere(q);
        const [rows, total, statusAgg] = await Promise.all([
            client_2.prisma.expense.findMany({
                where,
                orderBy: [{ expense_date: 'desc' }, { created_at: 'desc' }],
                skip,
                take: limit,
                include: EXPENSE_INCLUDE,
            }),
            client_2.prisma.expense.count({ where }),
            client_2.prisma.expense.groupBy({
                by: ['status'],
                where,
                _sum: { amount: true },
                _count: { _all: true },
            }),
        ]);
        const totals = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
        const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
        for (const row of statusAgg) {
            totals[row.status] = (0, helpers_1.asNumber)(row._sum.amount);
            counts[row.status] = row._count._all;
        }
        return {
            data: rows.map((e) => ({ ...e, amount: (0, helpers_1.asNumber)(e.amount) })),
            meta: {
                ...(0, pagination_1.paginationMeta)(total, page, limit),
                summary: {
                    totalAmount: totals.PENDING + totals.APPROVED + totals.REJECTED,
                    pendingAmount: totals.PENDING,
                    approvedAmount: totals.APPROVED,
                    rejectedAmount: totals.REJECTED,
                    pendingCount: counts.PENDING,
                },
            },
        };
    }
    async getById(id) {
        const e = await client_2.prisma.expense.findUnique({ where: { id }, include: EXPENSE_INCLUDE });
        if (!e)
            throw new apiError_1.AppError(404, 'Expense not found');
        return { ...e, amount: (0, helpers_1.asNumber)(e.amount) };
    }
    async create(data, userId) {
        if (data.category_id) {
            const cat = await client_2.prisma.expenseCategory.findUnique({ where: { id: data.category_id } });
            if (!cat)
                throw new apiError_1.AppError(400, 'Invalid expense category');
        }
        const created = await client_2.prisma.expense.create({
            data: {
                particular: data.particular.trim(),
                amount: new client_1.Prisma.Decimal(data.amount),
                category_id: data.category_id ?? null,
                payment_method: data.payment_method ?? 'CASH',
                bank_account: data.bank_account?.trim() || null,
                reference: data.reference?.trim() || null,
                vendor: data.vendor?.trim() || null,
                notes: data.notes?.trim() || null,
                expense_date: parseDateInput(data.expense_date) ?? new Date(),
                branch_id: data.branch_id ?? null,
                created_by: userId ?? null,
                status: 'PENDING',
            },
            include: EXPENSE_INCLUDE,
        });
        return { ...created, amount: (0, helpers_1.asNumber)(created.amount) };
    }
    async update(id, data) {
        const existing = await client_2.prisma.expense.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Expense not found');
        if (existing.status !== 'PENDING') {
            throw new apiError_1.AppError(400, 'Only pending expenses can be edited');
        }
        if (data.category_id) {
            const cat = await client_2.prisma.expenseCategory.findUnique({ where: { id: data.category_id } });
            if (!cat)
                throw new apiError_1.AppError(400, 'Invalid expense category');
        }
        const patch = {};
        if (data.particular !== undefined)
            patch.particular = data.particular.trim();
        if (data.amount !== undefined)
            patch.amount = new client_1.Prisma.Decimal(data.amount);
        if (data.category_id !== undefined) {
            patch.category = data.category_id
                ? { connect: { id: data.category_id } }
                : { disconnect: true };
        }
        if (data.payment_method !== undefined)
            patch.payment_method = data.payment_method;
        if (data.bank_account !== undefined)
            patch.bank_account = data.bank_account?.trim() || null;
        if (data.reference !== undefined)
            patch.reference = data.reference?.trim() || null;
        if (data.vendor !== undefined)
            patch.vendor = data.vendor?.trim() || null;
        if (data.notes !== undefined)
            patch.notes = data.notes?.trim() || null;
        if (data.expense_date !== undefined) {
            patch.expense_date = parseDateInput(data.expense_date) ?? existing.expense_date;
        }
        if (data.branch_id !== undefined) {
            patch.branch = data.branch_id
                ? { connect: { id: data.branch_id } }
                : { disconnect: true };
        }
        const updated = await client_2.prisma.expense.update({
            where: { id },
            data: patch,
            include: EXPENSE_INCLUDE,
        });
        return { ...updated, amount: (0, helpers_1.asNumber)(updated.amount) };
    }
    async remove(id) {
        const existing = await client_2.prisma.expense.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Expense not found');
        if (existing.cashflow_id) {
            throw new apiError_1.AppError(400, 'This expense belongs to a cash register session and cannot be deleted here');
        }
        await client_2.prisma.expense.delete({ where: { id } });
        return { id };
    }
    async approve(id, userId) {
        const existing = await client_2.prisma.expense.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Expense not found');
        if (existing.status === 'APPROVED')
            return this.getById(id);
        const updated = await client_2.prisma.expense.update({
            where: { id },
            data: {
                status: 'APPROVED',
                approved_by: userId,
                approved_at: new Date(),
                rejection_reason: null,
            },
            include: EXPENSE_INCLUDE,
        });
        return { ...updated, amount: (0, helpers_1.asNumber)(updated.amount) };
    }
    async reject(id, userId, reason) {
        const existing = await client_2.prisma.expense.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Expense not found');
        const updated = await client_2.prisma.expense.update({
            where: { id },
            data: {
                status: 'REJECTED',
                approved_by: userId,
                approved_at: new Date(),
                rejection_reason: reason?.trim() || null,
            },
            include: EXPENSE_INCLUDE,
        });
        return { ...updated, amount: (0, helpers_1.asNumber)(updated.amount) };
    }
    /** Aggregated report for a period: totals by category, payment method, status and month. */
    async report(q) {
        const where = this.buildWhere({ ...q, status: undefined });
        const [byCategoryRaw, byMethodRaw, byStatusRaw, rows] = await Promise.all([
            client_2.prisma.expense.groupBy({
                by: ['category_id'],
                where,
                _sum: { amount: true },
                _count: { _all: true },
            }),
            client_2.prisma.expense.groupBy({
                by: ['payment_method'],
                where,
                _sum: { amount: true },
                _count: { _all: true },
            }),
            client_2.prisma.expense.groupBy({
                by: ['status'],
                where,
                _sum: { amount: true },
                _count: { _all: true },
            }),
            client_2.prisma.expense.findMany({
                where,
                select: { amount: true, expense_date: true },
                orderBy: { expense_date: 'asc' },
            }),
        ]);
        const categoryIds = byCategoryRaw
            .map((r) => r.category_id)
            .filter((v) => Boolean(v));
        const cats = categoryIds.length
            ? await client_2.prisma.expenseCategory.findMany({
                where: { id: { in: categoryIds } },
                select: { id: true, name: true },
            })
            : [];
        const catName = new Map(cats.map((c) => [c.id, c.name]));
        const byMonthMap = new Map();
        for (const r of rows) {
            const key = `${r.expense_date.getFullYear()}-${String(r.expense_date.getMonth() + 1).padStart(2, '0')}`;
            byMonthMap.set(key, (byMonthMap.get(key) ?? 0) + (0, helpers_1.asNumber)(r.amount));
        }
        const total = rows.reduce((acc, r) => acc + (0, helpers_1.asNumber)(r.amount), 0);
        return {
            summary: { total, count: rows.length },
            byCategory: byCategoryRaw
                .map((r) => ({
                categoryId: r.category_id,
                category: r.category_id ? catName.get(r.category_id) ?? 'Unknown' : 'Uncategorised',
                amount: (0, helpers_1.asNumber)(r._sum.amount),
                count: r._count._all,
            }))
                .sort((a, b) => b.amount - a.amount),
            byPaymentMethod: byMethodRaw
                .map((r) => ({
                method: r.payment_method,
                amount: (0, helpers_1.asNumber)(r._sum.amount),
                count: r._count._all,
            }))
                .sort((a, b) => b.amount - a.amount),
            byStatus: byStatusRaw.map((r) => ({
                status: r.status,
                amount: (0, helpers_1.asNumber)(r._sum.amount),
                count: r._count._all,
            })),
            byMonth: [...byMonthMap.entries()]
                .map(([month, amount]) => ({ month, amount }))
                .sort((a, b) => a.month.localeCompare(b.month)),
        };
    }
}
exports.ExpenseService = ExpenseService;
/* ======================== recurring expenses ======================== */
const RECURRING_INCLUDE = {
    category: { select: { id: true, name: true } },
    branch: { select: { id: true, name: true } },
    _count: { select: { generated: true } },
};
class RecurringExpenseService {
    async list(opts) {
        const where = {};
        if (opts?.is_active !== undefined)
            where.is_active = opts.is_active;
        const rows = await client_2.prisma.recurringExpense.findMany({
            where,
            orderBy: [{ is_active: 'desc' }, { next_run_date: 'asc' }],
            include: RECURRING_INCLUDE,
        });
        return rows.map((r) => ({ ...r, amount: (0, helpers_1.asNumber)(r.amount) }));
    }
    async getById(id) {
        const r = await client_2.prisma.recurringExpense.findUnique({ where: { id }, include: RECURRING_INCLUDE });
        if (!r)
            throw new apiError_1.AppError(404, 'Recurring expense not found');
        return { ...r, amount: (0, helpers_1.asNumber)(r.amount) };
    }
    async create(data, userId) {
        const start = parseDateInput(data.start_date) ?? new Date();
        const created = await client_2.prisma.recurringExpense.create({
            data: {
                particular: data.particular.trim(),
                amount: new client_1.Prisma.Decimal(data.amount),
                category_id: data.category_id ?? null,
                payment_method: data.payment_method ?? 'CASH',
                bank_account: data.bank_account?.trim() || null,
                vendor: data.vendor?.trim() || null,
                notes: data.notes?.trim() || null,
                branch_id: data.branch_id ?? null,
                frequency: data.frequency,
                interval: data.interval ?? 1,
                start_date: start,
                end_date: parseDateInput(data.end_date ?? undefined) ?? null,
                next_run_date: start,
                is_active: data.is_active ?? true,
                auto_approve: data.auto_approve ?? false,
                created_by: userId ?? null,
            },
            include: RECURRING_INCLUDE,
        });
        return { ...created, amount: (0, helpers_1.asNumber)(created.amount) };
    }
    async update(id, data) {
        const existing = await client_2.prisma.recurringExpense.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Recurring expense not found');
        const patch = {};
        if (data.particular !== undefined)
            patch.particular = data.particular.trim();
        if (data.amount !== undefined)
            patch.amount = new client_1.Prisma.Decimal(data.amount);
        if (data.category_id !== undefined) {
            patch.category = data.category_id
                ? { connect: { id: data.category_id } }
                : { disconnect: true };
        }
        if (data.payment_method !== undefined)
            patch.payment_method = data.payment_method;
        if (data.bank_account !== undefined)
            patch.bank_account = data.bank_account?.trim() || null;
        if (data.vendor !== undefined)
            patch.vendor = data.vendor?.trim() || null;
        if (data.notes !== undefined)
            patch.notes = data.notes?.trim() || null;
        if (data.branch_id !== undefined) {
            patch.branch = data.branch_id ? { connect: { id: data.branch_id } } : { disconnect: true };
        }
        if (data.frequency !== undefined)
            patch.frequency = data.frequency;
        if (data.interval !== undefined)
            patch.interval = data.interval;
        if (data.start_date !== undefined) {
            patch.start_date = parseDateInput(data.start_date) ?? existing.start_date;
        }
        if (data.end_date !== undefined) {
            patch.end_date = parseDateInput(data.end_date ?? undefined) ?? null;
        }
        if (data.auto_approve !== undefined)
            patch.auto_approve = data.auto_approve;
        if (data.is_active !== undefined)
            patch.is_active = data.is_active;
        const updated = await client_2.prisma.recurringExpense.update({
            where: { id },
            data: patch,
            include: RECURRING_INCLUDE,
        });
        return { ...updated, amount: (0, helpers_1.asNumber)(updated.amount) };
    }
    async toggle(id) {
        const existing = await client_2.prisma.recurringExpense.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Recurring expense not found');
        return this.update(id, { is_active: !existing.is_active });
    }
    async remove(id) {
        const existing = await client_2.prisma.recurringExpense.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Recurring expense not found');
        // Keep already-generated expenses; just detach the link.
        await client_2.prisma.expense.updateMany({
            where: { recurring_id: id },
            data: { recurring_id: null },
        });
        await client_2.prisma.recurringExpense.delete({ where: { id } });
        return { id };
    }
    /**
     * Generate an Expense for every active template whose next_run_date has
     * passed (and that has not ended), then advance the schedule. Idempotent
     * per run window — safe to call from a button or a cron.
     */
    async runDue(userId, now = new Date()) {
        const due = await client_2.prisma.recurringExpense.findMany({
            where: {
                is_active: true,
                next_run_date: { lte: now },
                OR: [{ end_date: null }, { end_date: { gte: now } }],
            },
        });
        let generated = 0;
        for (const tpl of due) {
            // Catch up if several periods were missed, but cap the burst.
            let cursor = new Date(tpl.next_run_date);
            let guard = 0;
            while (cursor <= now && (!tpl.end_date || cursor <= tpl.end_date) && guard < 60) {
                await client_2.prisma.expense.create({
                    data: {
                        particular: tpl.particular,
                        amount: tpl.amount,
                        category_id: tpl.category_id,
                        payment_method: tpl.payment_method,
                        bank_account: tpl.bank_account,
                        vendor: tpl.vendor,
                        notes: tpl.notes,
                        branch_id: tpl.branch_id,
                        expense_date: cursor,
                        recurring_id: tpl.id,
                        created_by: userId ?? tpl.created_by,
                        status: tpl.auto_approve ? 'APPROVED' : 'PENDING',
                        approved_by: tpl.auto_approve ? userId ?? tpl.created_by : null,
                        approved_at: tpl.auto_approve ? new Date() : null,
                    },
                });
                generated += 1;
                cursor = advanceDate(cursor, tpl.frequency, tpl.interval);
                guard += 1;
            }
            const reachedEnd = tpl.end_date ? cursor > tpl.end_date : false;
            await client_2.prisma.recurringExpense.update({
                where: { id: tpl.id },
                data: {
                    next_run_date: cursor,
                    last_run_date: now,
                    is_active: reachedEnd ? false : tpl.is_active,
                },
            });
        }
        return { generated, templates: due.length };
    }
}
exports.RecurringExpenseService = RecurringExpenseService;
//# sourceMappingURL=expense.service.js.map