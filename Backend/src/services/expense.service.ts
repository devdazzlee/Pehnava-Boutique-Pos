import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { asNumber } from '../utils/helpers';
import { parsePagination, paginationMeta } from '../utils/pagination';
import { parseOptionalDateRange, parseYmdBound } from '../utils/timezone';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import type {
    CreateExpenseInput,
    UpdateExpenseInput,
    ExpenseListQuery,
    CreateExpenseCategoryInput,
    CreateRecurringExpenseInput,
    UpdateRecurringExpenseInput,
} from '../validations/expense.validation';
import { assertPeriodOpen } from './period-lock.service';
import { businessTodayYmd } from '../utils/timezone';

type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

/** Advance a date by one recurrence step. */
function advanceDate(from: Date, frequency: Frequency, interval: number): Date {
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

function parseDateInput(value?: string | null): Date | undefined {
    return parseYmdBound(value, 'start');
}

const chartOfAccounts = new ChartOfAccountsService();

/** Validates a Chart of Accounts expense head when one is supplied. */
async function checkAccount(accountId?: string | null) {
    if (accountId) await chartOfAccounts.assertExpenseAccount(accountId);
}

const ACCOUNT_SELECT = { select: { id: true, code: true, name: true } } as const;

const EXPENSE_INCLUDE = {
    category: { select: { id: true, name: true } },
    account: ACCOUNT_SELECT,
    branch: { select: { id: true, name: true } },
    creator: { select: { id: true, email: true } },
    approver: { select: { id: true, email: true } },
    _count: { select: { attachments: true } },
} satisfies Prisma.ExpenseInclude;

/* ============================ categories ============================ */

export class ExpenseCategoryService {
    async list(opts?: { search?: string; is_active?: boolean }) {
        const where: Prisma.ExpenseCategoryWhereInput = {};
        if (opts?.search?.trim()) {
            where.name = { contains: opts.search.trim(), mode: 'insensitive' };
        }
        if (opts?.is_active !== undefined) where.is_active = opts.is_active;

        const rows = await prisma.expenseCategory.findMany({
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

    async create(data: CreateExpenseCategoryInput) {
        const name = data.name.trim();
        const clash = await prisma.expenseCategory.findFirst({
            where: { name: { equals: name, mode: 'insensitive' } },
        });
        if (clash) throw new AppError(400, 'An expense category with this name already exists');
        const created = await prisma.expenseCategory.create({
            data: {
                name,
                description: data.description?.trim() || null,
                is_active: data.is_active ?? true,
            },
        });
        await chartOfAccounts.syncLinkedAccounts().catch(() => undefined);
        return created;
    }

    async update(id: string, data: { name?: string; description?: string | null; is_active?: boolean }) {
        const existing = await prisma.expenseCategory.findUnique({ where: { id } });
        if (!existing) throw new AppError(404, 'Expense category not found');

        const patch: Prisma.ExpenseCategoryUpdateInput = {};
        if (data.name !== undefined) {
            const name = data.name.trim();
            const clash = await prisma.expenseCategory.findFirst({
                where: { name: { equals: name, mode: 'insensitive' }, NOT: { id } },
            });
            if (clash) throw new AppError(400, 'An expense category with this name already exists');
            patch.name = name;
        }
        if (data.description !== undefined) patch.description = data.description?.trim() || null;
        if (data.is_active !== undefined) patch.is_active = data.is_active;

        const updated = await prisma.expenseCategory.update({ where: { id }, data: patch });
        if (patch.name) {
            await prisma.transactionalAccount
                .updateMany({
                    where: { expense_category_id: id },
                    data: { name: updated.name },
                })
                .catch(() => undefined);
        }
        return updated;
    }

    async toggle(id: string) {
        const existing = await prisma.expenseCategory.findUnique({ where: { id } });
        if (!existing) throw new AppError(404, 'Expense category not found');
        return prisma.expenseCategory.update({
            where: { id },
            data: { is_active: !existing.is_active },
        });
    }

    async remove(id: string) {
        const cat = await prisma.expenseCategory.findUnique({
            where: { id },
            include: { _count: { select: { expenses: true, recurring: true } } },
        });
        if (!cat) throw new AppError(404, 'Expense category not found');
        if (cat._count.expenses > 0 || cat._count.recurring > 0) {
            throw new AppError(
                400,
                `Cannot delete "${cat.name}" — it is used by ${cat._count.expenses} expense(s) and ${cat._count.recurring} recurring template(s). Deactivate it instead.`,
            );
        }
        await prisma.expenseCategory.delete({ where: { id } });
        return { id: cat.id, name: cat.name };
    }
}

/* ============================= expenses ============================= */

export class ExpenseService {
    private buildWhere(q: ExpenseListQuery): Prisma.ExpenseWhereInput {
        const where: Prisma.ExpenseWhereInput = {};
        if (q.search?.trim()) {
            const s = q.search.trim();
            where.OR = [
                { particular: { contains: s, mode: 'insensitive' } },
                { vendor: { contains: s, mode: 'insensitive' } },
                { reference: { contains: s, mode: 'insensitive' } },
            ];
        }
        if (q.category_id) where.category_id = q.category_id;
        if (q.account_id) where.account_id = q.account_id;
        if (q.payment_method) where.payment_method = q.payment_method;
        if (q.status) where.status = q.status;
        if (q.branch_id) where.branch_id = q.branch_id;

        const { start, end } = parseOptionalDateRange(q.from, q.to);
        if (start || end) {
            where.expense_date = {};
            if (start) where.expense_date.gte = start;
            if (end) where.expense_date.lte = end;
        }
        return where;
    }

    async list(q: ExpenseListQuery) {
        const fetchAll = q.fetch_all === 'true';
        const pageNum = Number(q.page);
        const limitNum = Number(q.limit);
        const page = fetchAll
            ? 1
            : Number.isFinite(pageNum) && pageNum > 0
              ? Math.floor(pageNum)
              : 1;
        const limit = fetchAll
            ? 5000
            : Math.min(
                  5000,
                  Math.max(1, Number.isFinite(limitNum) && limitNum > 0 ? Math.floor(limitNum) : 20),
              );
        const skip = fetchAll ? 0 : (page - 1) * limit;
        const where = this.buildWhere(q);

        const [rows, total, statusAgg] = await Promise.all([
            prisma.expense.findMany({
                where,
                orderBy: [{ expense_date: 'desc' }, { created_at: 'desc' }],
                skip,
                take: limit,
                include: EXPENSE_INCLUDE,
            }),
            prisma.expense.count({ where }),
            prisma.expense.groupBy({
                by: ['status'],
                where,
                _sum: { amount: true },
                _count: { _all: true },
            }),
        ]);

        const totals = { PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<string, number>;
        const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<string, number>;
        for (const row of statusAgg) {
            totals[row.status] = asNumber(row._sum.amount);
            counts[row.status] = row._count._all;
        }

        const metaPage = fetchAll ? 1 : page;
        const metaLimit = fetchAll ? rows.length : limit;
        return {
            data: rows.map((e) => ({ ...e, amount: asNumber(e.amount) })),
            meta: {
                ...paginationMeta(total, metaPage, fetchAll ? Math.max(metaLimit, 1) : limit),
                ...(fetchAll ? { totalPages: 1, fetchAll: true as const } : { fetchAll: false as const }),
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

    async getById(id: string) {
        const e = await prisma.expense.findUnique({ where: { id }, include: EXPENSE_INCLUDE });
        if (!e) throw new AppError(404, 'Expense not found');
        return { ...e, amount: asNumber(e.amount) };
    }

    async create(data: CreateExpenseInput, userId?: string, opts: { userBranchId?: string | null } = {}) {
        if (data.category_id) {
            const cat = await prisma.expenseCategory.findUnique({ where: { id: data.category_id } });
            if (!cat) throw new AppError(400, 'Invalid expense category');
        }
        await checkAccount(data.account_id);
        await assertPeriodOpen(parseDateInput(data.expense_date) ?? new Date(), 'an expense');

        // One simple rule: a today's expense entered while the register is open goes into that
        // register automatically (any payment method — only cash lowers the drawer). With no open
        // register it is simply saved; the next opening count already reflects the real cash.
        let cashflowId: string | null = null;
        let branchId = data.branch_id ?? opts.userBranchId ?? null;
        const expenseDay = data.expense_date ? String(data.expense_date).slice(0, 10) : businessTodayYmd();
        if (expenseDay === businessTodayYmd()) {
            const open = await prisma.cashFlow.findMany({
                where: { status: 'OPEN', ...(branchId ? { branch_id: branchId } : {}) },
                select: { id: true, branch_id: true },
            });
            if (open.length === 1) {
                cashflowId = open[0].id;
                branchId = branchId ?? open[0].branch_id;
            }
        }
        const fromDrawer = !!cashflowId;
        const created = await prisma.expense.create({
            data: {
                particular: data.particular.trim(),
                amount: new Prisma.Decimal(data.amount),
                category_id: data.category_id ?? null,
                account_id: data.account_id ?? null,
                payment_method: data.payment_method ?? 'CASH',
                bank_account: data.bank_account?.trim() || null,
                reference: data.reference?.trim() || null,
                vendor: data.vendor?.trim() || null,
                notes: data.notes?.trim() || null,
                expense_date: fromDrawer ? new Date() : parseDateInput(data.expense_date) ?? new Date(),
                branch_id: branchId,
                created_by: userId ?? null,
                // Recorded in the register = already paid, so it is approved straight away (like a paid-out).
                ...(fromDrawer
                    ? { cashflow_id: cashflowId, status: 'APPROVED' as const, approved_by: userId ?? null, approved_at: new Date() }
                    : { status: 'PENDING' as const }),
            },
            include: EXPENSE_INCLUDE,
        });
        return { ...created, amount: asNumber(created.amount) };
    }

    async update(id: string, data: UpdateExpenseInput) {
        const existing = await prisma.expense.findUnique({ where: { id } });
        if (!existing) throw new AppError(404, 'Expense not found');
        if (existing.status === 'REJECTED') {
            throw new AppError(400, 'Rejected expenses cannot be edited');
        }
        if (existing.cashflow_id) {
            throw new AppError(
                400,
                'This expense belongs to a cash register session and cannot be edited here',
            );
        }
        await assertPeriodOpen(existing.expense_date, 'an expense');
        if (data.expense_date) await assertPeriodOpen(parseDateInput(data.expense_date), 'an expense');
        if (data.category_id) {
            const cat = await prisma.expenseCategory.findUnique({ where: { id: data.category_id } });
            if (!cat) throw new AppError(400, 'Invalid expense category');
        }
        await checkAccount(data.account_id);

        const patch: Prisma.ExpenseUpdateInput = {};
        if (data.particular !== undefined) patch.particular = data.particular.trim();
        if (data.amount !== undefined) patch.amount = new Prisma.Decimal(data.amount);
        if (data.category_id !== undefined) {
            patch.category = data.category_id
                ? { connect: { id: data.category_id } }
                : { disconnect: true };
        }
        if (data.account_id !== undefined) {
            patch.account = data.account_id
                ? { connect: { id: data.account_id } }
                : { disconnect: true };
        }
        if (data.payment_method !== undefined) patch.payment_method = data.payment_method;
        if (data.bank_account !== undefined) patch.bank_account = data.bank_account?.trim() || null;
        if (data.reference !== undefined) patch.reference = data.reference?.trim() || null;
        if (data.vendor !== undefined) patch.vendor = data.vendor?.trim() || null;
        if (data.notes !== undefined) patch.notes = data.notes?.trim() || null;
        if (data.expense_date !== undefined) {
            patch.expense_date = parseDateInput(data.expense_date) ?? existing.expense_date;
        }
        if (data.branch_id !== undefined) {
            patch.branch = data.branch_id
                ? { connect: { id: data.branch_id } }
                : { disconnect: true };
        }

        const updated = await prisma.expense.update({
            where: { id },
            data: patch,
            include: EXPENSE_INCLUDE,
        });
        return { ...updated, amount: asNumber(updated.amount) };
    }

    async remove(id: string) {
        const existing = await prisma.expense.findUnique({ where: { id } });
        if (!existing) throw new AppError(404, 'Expense not found');
        if (existing.cashflow_id) {
            throw new AppError(400, 'This expense belongs to a cash register session and cannot be deleted here');
        }
        await assertPeriodOpen(existing.expense_date, 'an expense');
        await prisma.expense.delete({ where: { id } });
        return { id };
    }

    async approve(id: string, userId: string) {
        const existing = await prisma.expense.findUnique({ where: { id } });
        if (!existing) throw new AppError(404, 'Expense not found');
        if (existing.status === 'APPROVED') return this.getById(id);
        await assertPeriodOpen(existing.expense_date, 'an expense');
        const updated = await prisma.expense.update({
            where: { id },
            data: {
                status: 'APPROVED',
                approved_by: userId,
                approved_at: new Date(),
                rejection_reason: null,
            },
            include: EXPENSE_INCLUDE,
        });
        return { ...updated, amount: asNumber(updated.amount) };
    }

    async reject(id: string, userId: string, reason?: string) {
        const existing = await prisma.expense.findUnique({ where: { id } });
        if (!existing) throw new AppError(404, 'Expense not found');
        await assertPeriodOpen(existing.expense_date, 'an expense');
        const updated = await prisma.expense.update({
            where: { id },
            data: {
                status: 'REJECTED',
                approved_by: userId,
                approved_at: new Date(),
                rejection_reason: reason?.trim() || null,
            },
            include: EXPENSE_INCLUDE,
        });
        return { ...updated, amount: asNumber(updated.amount) };
    }

    /** Aggregated report for a period: totals by category, payment method, status and month. */
    async report(q: { from?: string; to?: string; branch_id?: string }) {
        const where = this.buildWhere({ ...q, status: undefined } as ExpenseListQuery);

        const [byCategoryRaw, byMethodRaw, byStatusRaw, rows] = await Promise.all([
            prisma.expense.groupBy({
                by: ['category_id'],
                where,
                _sum: { amount: true },
                _count: { _all: true },
            }),
            prisma.expense.groupBy({
                by: ['payment_method'],
                where,
                _sum: { amount: true },
                _count: { _all: true },
            }),
            prisma.expense.groupBy({
                by: ['status'],
                where,
                _sum: { amount: true },
                _count: { _all: true },
            }),
            prisma.expense.findMany({
                where,
                select: { amount: true, expense_date: true },
                orderBy: { expense_date: 'asc' },
            }),
        ]);

        const categoryIds = byCategoryRaw
            .map((r) => r.category_id)
            .filter((v): v is string => Boolean(v));
        const cats = categoryIds.length
            ? await prisma.expenseCategory.findMany({
                  where: { id: { in: categoryIds } },
                  select: { id: true, name: true },
              })
            : [];
        const catName = new Map(cats.map((c) => [c.id, c.name]));

        const byMonthMap = new Map<string, number>();
        for (const r of rows) {
            const key = `${r.expense_date.getFullYear()}-${String(
                r.expense_date.getMonth() + 1,
            ).padStart(2, '0')}`;
            byMonthMap.set(key, (byMonthMap.get(key) ?? 0) + asNumber(r.amount));
        }

        const total = rows.reduce((acc, r) => acc + asNumber(r.amount), 0);

        return {
            summary: { total, count: rows.length },
            byCategory: byCategoryRaw
                .map((r) => ({
                    categoryId: r.category_id,
                    category: r.category_id ? catName.get(r.category_id) ?? 'Unknown' : 'Uncategorised',
                    amount: asNumber(r._sum.amount),
                    count: r._count._all,
                }))
                .sort((a, b) => b.amount - a.amount),
            byPaymentMethod: byMethodRaw
                .map((r) => ({
                    method: r.payment_method,
                    amount: asNumber(r._sum.amount),
                    count: r._count._all,
                }))
                .sort((a, b) => b.amount - a.amount),
            byStatus: byStatusRaw.map((r) => ({
                status: r.status,
                amount: asNumber(r._sum.amount),
                count: r._count._all,
            })),
            byMonth: [...byMonthMap.entries()]
                .map(([month, amount]) => ({ month, amount }))
                .sort((a, b) => a.month.localeCompare(b.month)),
        };
    }
}

/* ======================== recurring expenses ======================== */

const RECURRING_INCLUDE = {
    category: { select: { id: true, name: true } },
    account: ACCOUNT_SELECT,
    branch: { select: { id: true, name: true } },
    _count: { select: { generated: true } },
} satisfies Prisma.RecurringExpenseInclude;

export class RecurringExpenseService {
    async list(opts?: { is_active?: boolean }) {
        const where: Prisma.RecurringExpenseWhereInput = {};
        if (opts?.is_active !== undefined) where.is_active = opts.is_active;
        const rows = await prisma.recurringExpense.findMany({
            where,
            orderBy: [{ is_active: 'desc' }, { next_run_date: 'asc' }],
            include: RECURRING_INCLUDE,
        });
        return rows.map((r) => ({ ...r, amount: asNumber(r.amount) }));
    }

    async getById(id: string) {
        const r = await prisma.recurringExpense.findUnique({ where: { id }, include: RECURRING_INCLUDE });
        if (!r) throw new AppError(404, 'Recurring expense not found');
        return { ...r, amount: asNumber(r.amount) };
    }

    async create(data: CreateRecurringExpenseInput, userId?: string) {
        const start = parseDateInput(data.start_date) ?? new Date();
        await checkAccount(data.account_id);
        const created = await prisma.recurringExpense.create({
            data: {
                particular: data.particular.trim(),
                amount: new Prisma.Decimal(data.amount),
                category_id: data.category_id ?? null,
                account_id: data.account_id ?? null,
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
        return { ...created, amount: asNumber(created.amount) };
    }

    async update(id: string, data: UpdateRecurringExpenseInput) {
        const existing = await prisma.recurringExpense.findUnique({ where: { id } });
        if (!existing) throw new AppError(404, 'Recurring expense not found');
        await checkAccount(data.account_id);

        const patch: Prisma.RecurringExpenseUpdateInput = {};
        if (data.particular !== undefined) patch.particular = data.particular.trim();
        if (data.amount !== undefined) patch.amount = new Prisma.Decimal(data.amount);
        if (data.category_id !== undefined) {
            patch.category = data.category_id
                ? { connect: { id: data.category_id } }
                : { disconnect: true };
        }
        if (data.account_id !== undefined) {
            patch.account = data.account_id
                ? { connect: { id: data.account_id } }
                : { disconnect: true };
        }
        if (data.payment_method !== undefined) patch.payment_method = data.payment_method;
        if (data.bank_account !== undefined) patch.bank_account = data.bank_account?.trim() || null;
        if (data.vendor !== undefined) patch.vendor = data.vendor?.trim() || null;
        if (data.notes !== undefined) patch.notes = data.notes?.trim() || null;
        if (data.branch_id !== undefined) {
            patch.branch = data.branch_id ? { connect: { id: data.branch_id } } : { disconnect: true };
        }
        if (data.frequency !== undefined) patch.frequency = data.frequency;
        if (data.interval !== undefined) patch.interval = data.interval;
        if (data.start_date !== undefined) {
            patch.start_date = parseDateInput(data.start_date) ?? existing.start_date;
        }
        if (data.end_date !== undefined) {
            patch.end_date = parseDateInput(data.end_date ?? undefined) ?? null;
        }
        if (data.auto_approve !== undefined) patch.auto_approve = data.auto_approve;
        if (data.is_active !== undefined) patch.is_active = data.is_active;

        const updated = await prisma.recurringExpense.update({
            where: { id },
            data: patch,
            include: RECURRING_INCLUDE,
        });
        return { ...updated, amount: asNumber(updated.amount) };
    }

    async toggle(id: string) {
        const existing = await prisma.recurringExpense.findUnique({ where: { id } });
        if (!existing) throw new AppError(404, 'Recurring expense not found');
        return this.update(id, { is_active: !existing.is_active });
    }

    async remove(id: string) {
        const existing = await prisma.recurringExpense.findUnique({ where: { id } });
        if (!existing) throw new AppError(404, 'Recurring expense not found');
        // Keep already-generated expenses; just detach the link.
        await prisma.expense.updateMany({
            where: { recurring_id: id },
            data: { recurring_id: null },
        });
        await prisma.recurringExpense.delete({ where: { id } });
        return { id };
    }

    /**
     * Generate an Expense for every active template whose next_run_date has
     * passed (and that has not ended), then advance the schedule. Idempotent
     * per run window — safe to call from a button or a cron.
     */
    async runDue(userId?: string, now: Date = new Date()) {
        const due = await prisma.recurringExpense.findMany({
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
                await prisma.expense.create({
                    data: {
                        particular: tpl.particular,
                        amount: tpl.amount,
                        category_id: tpl.category_id,
                        account_id: tpl.account_id,
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
                cursor = advanceDate(cursor, tpl.frequency as Frequency, tpl.interval);
                guard += 1;
            }

            const reachedEnd = tpl.end_date ? cursor > tpl.end_date : false;
            await prisma.recurringExpense.update({
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
