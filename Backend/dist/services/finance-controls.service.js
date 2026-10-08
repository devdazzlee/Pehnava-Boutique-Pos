"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinanceControlsService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const timezone_1 = require("../utils/timezone");
const chart_of_accounts_service_1 = require("./chart-of-accounts.service");
const period_lock_service_1 = require("./period-lock.service");
const coa = new chart_of_accounts_service_1.ChartOfAccountsService();
const num = (v) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
};
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(y, m, 0).getDate();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/* ============================================================
 * Budgets per expense account, budget vs actual, expense
 * receipts and saved report views.
 * ============================================================ */
class FinanceControlsService {
    /* ------------------------------ budgets ------------------------------ */
    async expenseAccounts() {
        await coa.expenseAccountOptions(); // keeps employee / category linked accounts in sync
        const rows = await client_2.prisma.transactionalAccount.findMany({
            where: { is_active: true, control: { sub_type: { type_code: 5 } }, OR: [{ system_key: null }, { system_key: { not: 'COGS' } }] },
            select: {
                id: true,
                code: true,
                name: true,
                employee_id: true,
                expense_category_id: true,
                system_key: true,
                control: { select: { code: true, name: true, sub_type: { select: { name: true } } } },
            },
            orderBy: { code: 'asc' },
        });
        return rows.map((a) => ({
            id: a.id,
            code: a.code,
            name: a.name,
            control: a.control.name,
            controlCode: a.control.code,
            subType: a.control.sub_type.name,
            linked: a.employee_id ? 'EMPLOYEE' : a.expense_category_id ? 'EXPENSE_CATEGORY' : a.system_key ? 'SYSTEM' : null,
        }));
    }
    async budgets(year, branchId) {
        const [accounts, rows] = await Promise.all([
            this.expenseAccounts(),
            client_2.prisma.budget.findMany({ where: { year, branch_id: branchId ?? null } }),
        ]);
        const map = new Map();
        for (const r of rows) {
            const arr = map.get(r.account_id) ?? Array(12).fill(0);
            arr[r.month - 1] = num(r.amount);
            map.set(r.account_id, arr);
        }
        return {
            year,
            branchId: branchId ?? null,
            accounts: accounts.map((a) => {
                const months = map.get(a.id) ?? Array(12).fill(0);
                return { ...a, months, total: r2(months.reduce((t, v) => t + v, 0)) };
            }),
        };
    }
    async saveBudgets(actor, body) {
        const branchId = body.branchId ?? null;
        if (!body.rows?.length)
            return this.budgets(body.year, branchId);
        const accountIds = [...new Set(body.rows.map((r) => r.accountId))];
        const valid = await client_2.prisma.transactionalAccount.count({ where: { id: { in: accountIds }, control: { sub_type: { type_code: 5 } } } });
        if (valid !== accountIds.length)
            throw new apiError_1.AppError(400, 'Budgets can only be set on expense accounts');
        const existing = await client_2.prisma.budget.findMany({ where: { year: body.year, branch_id: branchId, account_id: { in: accountIds } } });
        const key = (a, m) => `${a}|${m}`;
        const byKey = new Map(existing.map((e) => [key(e.account_id, e.month), e]));
        const ops = [];
        for (const r of body.rows) {
            if (r.month < 1 || r.month > 12)
                throw new apiError_1.AppError(400, 'Month must be 1–12');
            if (!(r.amount >= 0))
                throw new apiError_1.AppError(400, 'Budget cannot be negative');
            const found = byKey.get(key(r.accountId, r.month));
            if (found) {
                ops.push(client_2.prisma.budget.update({ where: { id: found.id }, data: { amount: new client_1.Prisma.Decimal(r.amount) } }));
            }
            else if (r.amount > 0) {
                ops.push(client_2.prisma.budget.create({
                    data: { account_id: r.accountId, branch_id: branchId, year: body.year, month: r.month, amount: new client_1.Prisma.Decimal(r.amount), created_by: actor.userId ?? null },
                }));
            }
        }
        await client_2.prisma.$transaction(ops);
        return this.budgets(body.year, branchId);
    }
    /** Copy one year's budget into another, optionally changing it by a percentage. */
    async copyBudgets(actor, body) {
        const src = await client_2.prisma.budget.findMany({ where: { year: body.fromYear, branch_id: body.branchId ?? null } });
        if (!src.length)
            throw new apiError_1.AppError(400, `No budget found for ${body.fromYear}`);
        const factor = 1 + (body.adjustPct ?? 0) / 100;
        return this.saveBudgets(actor, {
            year: body.toYear,
            branchId: body.branchId ?? null,
            rows: src.map((b) => ({ accountId: b.account_id, month: b.month, amount: r2(num(b.amount) * factor) })),
        });
    }
    async budgetVsActual(actor, q) {
        const { year } = q;
        const month = q.month && q.month >= 1 && q.month <= 12 ? q.month : null;
        const params = { branchId: q.branchId ?? undefined, userRole: actor.role, userBranchId: actor.branchId };
        const monthsRange = month ? [month] : Array.from({ length: 12 }, (_, i) => i + 1);
        const today = (0, timezone_1.businessTodayYmd)();
        const [budgetRows, ...actuals] = await Promise.all([
            client_2.prisma.budget.findMany({ where: { year, branch_id: q.branchId ?? null } }),
            // Actual expense per account for each month needed (YTD = Jan..month).
            ...Array.from({ length: month ?? 12 }, (_, i) => i + 1).map((m) => {
                const from = `${year}-${pad(m)}-01`;
                if (from > today)
                    return Promise.resolve(null);
                return coa.expenseBreakdown({ ...params, from, to: `${year}-${pad(m)}-${pad(lastDay(year, m))}` });
            }),
        ]);
        const actualBy = new Map(); // accountId -> per month
        const meta = new Map();
        actuals.forEach((res, idx) => {
            if (!res)
                return;
            for (const sub of res.subTypes)
                for (const c of sub.controls)
                    for (const a of c.accounts) {
                        meta.set(a.id, { code: a.code, name: a.name, control: c.name, subType: sub.name });
                        const arr = actualBy.get(a.id) ?? Array(12).fill(0);
                        arr[idx] = a.amount;
                        actualBy.set(a.id, arr);
                    }
        });
        const budgetBy = new Map();
        for (const b of budgetRows) {
            const arr = budgetBy.get(b.account_id) ?? Array(12).fill(0);
            arr[b.month - 1] = num(b.amount);
            budgetBy.set(b.account_id, arr);
        }
        if (budgetBy.size) {
            const missing = [...budgetBy.keys()].filter((id) => !meta.has(id));
            if (missing.length) {
                const extra = await client_2.prisma.transactionalAccount.findMany({
                    where: { id: { in: missing } },
                    select: { id: true, code: true, name: true, control: { select: { name: true, sub_type: { select: { name: true } } } } },
                });
                for (const a of extra)
                    meta.set(a.id, { code: a.code, name: a.name, control: a.control.name, subType: a.control.sub_type.name });
            }
        }
        // Only budgetable heads (cost of goods sold follows sales and is left out).
        const budgetable = new Set((await this.expenseAccounts()).map((a) => a.id));
        const ids = new Set([...actualBy.keys(), ...budgetBy.keys()].filter((id) => budgetable.has(id)));
        const sum = (arr, months) => r2(months.reduce((t, m) => t + (arr?.[m - 1] ?? 0), 0));
        const periodMonths = month ? [month] : monthsRange;
        const ytdMonths = Array.from({ length: month ?? 12 }, (_, i) => i + 1);
        const rows = [...ids]
            .map((id) => {
            const m = meta.get(id);
            const budget = sum(budgetBy.get(id), periodMonths);
            const actual = sum(actualBy.get(id), periodMonths);
            const ytdBudget = sum(budgetBy.get(id), ytdMonths);
            const ytdActual = sum(actualBy.get(id), ytdMonths);
            return {
                accountId: id,
                code: m?.code ?? '',
                name: m?.name ?? 'Account',
                control: m?.control ?? '',
                subType: m?.subType ?? '',
                budget,
                actual,
                variance: r2(budget - actual),
                usedPct: budget > 0 ? r2((actual / budget) * 100) : null,
                ytdBudget,
                ytdActual,
                ytdVariance: r2(ytdBudget - ytdActual),
                status: budget <= 0 ? (actual > 0 ? 'NO_BUDGET' : 'NONE') : actual > budget ? 'OVER' : actual > budget * 0.9 ? 'NEAR' : 'OK',
            };
        })
            .filter((r) => r.budget > 0 || r.actual !== 0 || r.ytdBudget > 0)
            .sort((a, b) => a.code.localeCompare(b.code));
        const monthly = Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            label: MONTHS[i],
            budget: r2([...budgetBy.values()].reduce((t, arr) => t + arr[i], 0)),
            actual: r2([...actualBy.entries()].reduce((t, [id, arr]) => t + (budgetable.has(id) ? arr[i] : 0), 0)),
        })).filter((m) => !month || m.month <= month);
        const totals = {
            budget: r2(rows.reduce((t, r) => t + r.budget, 0)),
            actual: r2(rows.reduce((t, r) => t + r.actual, 0)),
            ytdBudget: r2(rows.reduce((t, r) => t + r.ytdBudget, 0)),
            ytdActual: r2(rows.reduce((t, r) => t + r.ytdActual, 0)),
            over: rows.filter((r) => r.status === 'OVER').length,
            unbudgeted: rows.filter((r) => r.status === 'NO_BUDGET').length,
        };
        return { year, month, rows, monthly, totals: { ...totals, variance: r2(totals.budget - totals.actual) } };
    }
    /* ------------------------------ expense receipts ------------------------------ */
    async attachments(expenseId) {
        const rows = await client_2.prisma.expenseAttachment.findMany({ where: { expense_id: expenseId }, orderBy: { created_at: 'asc' } });
        return rows;
    }
    async addAttachment(actor, expenseId, file) {
        const expense = await client_2.prisma.expense.findUnique({ where: { id: expenseId }, select: { id: true, expense_date: true, _count: { select: { attachments: true } } } });
        if (!expense)
            throw new apiError_1.AppError(404, 'Expense not found');
        await (0, period_lock_service_1.assertPeriodOpen)(expense.expense_date, 'an expense');
        if (expense._count.attachments >= 10)
            throw new apiError_1.AppError(400, 'An expense can have up to 10 attachments');
        const { imageService } = await Promise.resolve().then(() => __importStar(require('./common/cloudinaryService')));
        const url = await imageService.uploadDocument(file, { folder: 'expense-receipts' });
        return client_2.prisma.expenseAttachment.create({
            data: {
                expense_id: expenseId,
                url,
                name: file.originalname?.slice(0, 200) || 'receipt',
                mime_type: file.mimetype,
                size: file.size,
                uploaded_by: actor.userId ?? null,
            },
        });
    }
    async removeAttachment(id) {
        const row = await client_2.prisma.expenseAttachment.findUnique({ where: { id }, include: { expense: { select: { expense_date: true } } } });
        if (!row)
            throw new apiError_1.AppError(404, 'Attachment not found');
        await (0, period_lock_service_1.assertPeriodOpen)(row.expense.expense_date, 'an expense');
        await client_2.prisma.expenseAttachment.delete({ where: { id } });
        return { id };
    }
    /* ------------------------------ saved reports ------------------------------ */
    async savedReports(actor, report) {
        const rows = await client_2.prisma.savedReport.findMany({
            where: { ...(report ? { report } : {}), OR: [{ user_id: actor.userId ?? '__none__' }, { is_shared: true }] },
            orderBy: { name: 'asc' },
        });
        return rows.map((r) => ({ id: r.id, name: r.name, report: r.report, params: r.params, isShared: r.is_shared, mine: r.user_id === actor.userId, updatedAt: r.updated_at }));
    }
    async saveReport(actor, body) {
        if (!actor.userId)
            throw new apiError_1.AppError(401, 'Sign in again');
        const name = body.name?.trim();
        if (!name)
            throw new apiError_1.AppError(400, 'Give the view a name');
        const clash = await client_2.prisma.savedReport.findFirst({ where: { user_id: actor.userId, report: body.report, name } });
        const data = { name, report: body.report, params: body.params, is_shared: !!body.isShared };
        const row = clash
            ? await client_2.prisma.savedReport.update({ where: { id: clash.id }, data })
            : await client_2.prisma.savedReport.create({ data: { ...data, user_id: actor.userId } });
        return { id: row.id };
    }
    async deleteReport(actor, id) {
        const row = await client_2.prisma.savedReport.findUnique({ where: { id } });
        if (!row)
            throw new apiError_1.AppError(404, 'Saved view not found');
        const admin = actor.role === 'SUPER_ADMIN' || actor.role === 'ADMIN';
        if (row.user_id !== actor.userId && !admin)
            throw new apiError_1.AppError(403, 'Only the person who saved this view can delete it');
        await client_2.prisma.savedReport.delete({ where: { id } });
        return { id };
    }
}
exports.FinanceControlsService = FinanceControlsService;
//# sourceMappingURL=finance-controls.service.js.map