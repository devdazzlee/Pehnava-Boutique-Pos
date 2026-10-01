"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommissionService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const helpers_1 = require("../utils/helpers");
const timezone_1 = require("../utils/timezone");
const INCLUDED_STATUSES = ['COMPLETED', 'REFUNDED', 'EXCHANGED'];
const num = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const employeeSelect = {
    id: true,
    name: true,
    employee_code: true,
    commission_rate: true,
    user_id: true,
    phone_number: true,
    department: { select: { id: true, name: true } },
    employee_type: { select: { id: true, name: true } },
    branch: { select: { id: true, name: true, code: true } },
    user: { select: { id: true, email: true } },
};
class CommissionService {
    async list(params) {
        const page = params.page || 1;
        const limit = params.fetch_all ? 500 : params.limit || 20;
        const skip = params.fetch_all ? 0 : (page - 1) * limit;
        const where = {};
        if (params.employee_id)
            where.employee_id = params.employee_id;
        if (params.month)
            where.month = params.month;
        if (params.year)
            where.year = params.year;
        if (params.is_paid !== undefined)
            where.is_paid = params.is_paid;
        const employeeWhere = {};
        if (params.branch_id)
            employeeWhere.branch_id = params.branch_id;
        if (params.search?.trim()) {
            employeeWhere.OR = [
                { name: { contains: params.search.trim(), mode: 'insensitive' } },
                { employee_code: { contains: params.search.trim(), mode: 'insensitive' } },
            ];
        }
        if (Object.keys(employeeWhere).length > 0) {
            where.employee = employeeWhere;
        }
        const [rows, total, paidCount, totalSum, paidSum, unpaidSum, piecesSum, salesSum] = await Promise.all([
            client_1.prisma.commission.findMany({
                where,
                include: { employee: { select: employeeSelect } },
                skip,
                take: limit,
                orderBy: [{ year: 'desc' }, { month: 'desc' }, { created_at: 'desc' }],
            }),
            client_1.prisma.commission.count({ where }),
            client_1.prisma.commission.count({ where: { ...where, is_paid: true } }),
            client_1.prisma.commission.aggregate({ where, _sum: { amount: true } }),
            client_1.prisma.commission.aggregate({
                where: { ...where, is_paid: true },
                _sum: { amount: true },
            }),
            client_1.prisma.commission.aggregate({
                where: { ...where, is_paid: false },
                _sum: { amount: true },
            }),
            client_1.prisma.commission.aggregate({ where, _sum: { pieces: true } }),
            client_1.prisma.commission.aggregate({ where, _sum: { sales_amount: true } }),
        ]);
        const data = rows.map((row) => this.serialize(row));
        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit) || 1,
                summary: {
                    totalCommission: (0, helpers_1.asNumber)(totalSum._sum.amount),
                    paidAmount: (0, helpers_1.asNumber)(paidSum._sum.amount),
                    unpaidAmount: (0, helpers_1.asNumber)(unpaidSum._sum.amount),
                    outstanding: (0, helpers_1.asNumber)(unpaidSum._sum.amount),
                    paidCount,
                    unpaidCount: total - paidCount,
                    totalPieces: (0, helpers_1.asNumber)(piecesSum._sum.pieces),
                    totalSales: (0, helpers_1.asNumber)(salesSum._sum.sales_amount),
                    employeeCount: new Set(data.map((r) => r.employee_id)).size,
                },
            },
        };
    }
    /** Live sales → commission preview for a date range (does not save). */
    async preview(params) {
        const isAdmin = params.userRole === 'SUPER_ADMIN' || params.userRole === 'ADMIN';
        const branchId = isAdmin
            ? params.branch_id || params.userBranchId || undefined
            : params.userBranchId || undefined;
        const aggregates = await this.aggregateSales({
            from: params.from,
            to: params.to,
            employeeId: params.employee_id,
            branchId,
        });
        const summary = {
            totalSales: round2(aggregates.reduce((s, r) => s + r.salesAmount, 0)),
            totalPieces: round2(aggregates.reduce((s, r) => s + r.pieces, 0)),
            totalBills: aggregates.reduce((s, r) => s + r.bills, 0),
            totalCommission: round2(aggregates.reduce((s, r) => s + r.commissionAmount, 0)),
            employeeCount: aggregates.length,
        };
        return {
            period: { from: params.from, to: params.to },
            rows: aggregates,
            summary,
        };
    }
    async generate(data, opts) {
        const month = data.month;
        const year = data.year;
        const from = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const aggregates = await this.aggregateSales({
            from,
            to,
            employeeId: data.employee_id,
            branchId: opts?.branch_id,
        });
        if (aggregates.length === 0) {
            throw new apiError_1.AppError(400, 'No linked employee sales found for this period. Link a POS user on the employee profile first.');
        }
        const results = [];
        for (const row of aggregates) {
            const existing = await client_1.prisma.commission.findUnique({
                where: {
                    employee_id_month_year: {
                        employee_id: row.employeeId,
                        month,
                        year,
                    },
                },
            });
            if (existing && !data.overwrite) {
                results.push(this.serialize({ ...existing, employee: row.employeeRaw }));
                continue;
            }
            if (existing?.is_paid && !data.overwrite) {
                results.push(this.serialize({ ...existing, employee: row.employeeRaw }));
                continue;
            }
            const saved = await client_1.prisma.commission.upsert({
                where: {
                    employee_id_month_year: {
                        employee_id: row.employeeId,
                        month,
                        year,
                    },
                },
                create: {
                    employee_id: row.employeeId,
                    month,
                    year,
                    sales_amount: row.salesAmount,
                    pieces: row.pieces,
                    bills: row.bills,
                    rate: row.rate,
                    amount: row.commissionAmount,
                    is_paid: false,
                    paid_date: null,
                    notes: `Auto-generated from sales ${from} → ${to}`,
                },
                update: {
                    sales_amount: row.salesAmount,
                    pieces: row.pieces,
                    bills: row.bills,
                    rate: row.rate,
                    amount: row.commissionAmount,
                    notes: `Recalculated from sales ${from} → ${to}`,
                    updated_at: new Date(),
                },
                include: { employee: { select: employeeSelect } },
            });
            results.push(this.serialize(saved));
        }
        return {
            period: { from, to, month, year },
            count: results.length,
            data: results,
        };
    }
    async getById(id) {
        const row = await client_1.prisma.commission.findUnique({
            where: { id },
            include: { employee: { select: employeeSelect } },
        });
        if (!row)
            throw new apiError_1.AppError(404, 'Commission record not found');
        return this.serialize(row);
    }
    async update(id, data) {
        const existing = await client_1.prisma.commission.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Commission record not found');
        const updateData = {};
        if (data.rate !== undefined) {
            updateData.rate = data.rate;
            if (data.amount === undefined) {
                updateData.amount = round2((0, helpers_1.asNumber)(existing.sales_amount) * (data.rate / 100));
            }
        }
        if (data.amount !== undefined)
            updateData.amount = data.amount;
        if (data.notes !== undefined)
            updateData.notes = data.notes;
        if (data.is_paid !== undefined) {
            updateData.is_paid = data.is_paid;
            updateData.paid_date = data.is_paid
                ? data.paid_date
                    ? new Date(data.paid_date)
                    : existing.paid_date || new Date()
                : null;
        }
        else if (data.paid_date !== undefined) {
            updateData.paid_date = data.paid_date ? new Date(data.paid_date) : null;
        }
        const row = await client_1.prisma.commission.update({
            where: { id },
            data: updateData,
            include: { employee: { select: employeeSelect } },
        });
        return this.serialize(row);
    }
    async markPaid(id, paid_date) {
        return this.update(id, {
            is_paid: true,
            paid_date: paid_date || new Date().toISOString(),
        });
    }
    async markUnpaid(id) {
        return this.update(id, { is_paid: false, paid_date: null });
    }
    async delete(id) {
        const existing = await client_1.prisma.commission.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Commission record not found');
        await client_1.prisma.commission.delete({ where: { id } });
        return { message: 'Commission deleted successfully' };
    }
    /** Sales that contribute to a saved commission period. */
    async salesForCommission(id) {
        const row = await client_1.prisma.commission.findUnique({
            where: { id },
            include: { employee: { select: employeeSelect } },
        });
        if (!row)
            throw new apiError_1.AppError(404, 'Commission record not found');
        if (!row.employee.user_id) {
            return { commission: this.serialize(row), sales: [], summary: { bills: 0, pieces: 0, salesAmount: 0 } };
        }
        const from = `${row.year}-${String(row.month).padStart(2, '0')}-01`;
        const lastDay = new Date(row.year, row.month, 0).getDate();
        const to = `${row.year}-${String(row.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const { start, end } = (0, timezone_1.localRange)(from, to);
        const sales = await client_1.prisma.sale.findMany({
            where: {
                created_by: row.employee.user_id,
                sale_date: { gte: start, lte: end },
                status: { in: INCLUDED_STATUSES },
            },
            include: {
                customer: { select: { id: true, name: true, phone_number: true, mobile_number: true } },
                sale_items: {
                    select: {
                        quantity: true,
                        line_total: true,
                        item_type: true,
                        product: { select: { name: true, sku: true } },
                    },
                },
            },
            orderBy: { sale_date: 'desc' },
        });
        const mapped = sales
            .filter((sale) => !this.isRegenerated(sale.notes))
            .map((sale) => {
            let pieces = 0;
            let salesAmount = 0;
            for (const item of sale.sale_items) {
                const qty = num(item.quantity);
                const line = num(item.line_total);
                pieces += qty;
                salesAmount += line;
            }
            return {
                id: sale.id,
                date: sale.sale_date.toISOString(),
                voucher: sale.invoice_number || sale.sale_number,
                status: sale.status,
                customer: sale.customer?.name?.trim() || 'Walk-in',
                pieces: round2(pieces),
                salesAmount: round2(salesAmount),
                items: sale.sale_items.map((item) => ({
                    product: item.product.name,
                    sku: item.product.sku,
                    quantity: round2(num(item.quantity)),
                    amount: round2(num(item.line_total)),
                    type: item.item_type,
                })),
            };
        });
        return {
            commission: this.serialize(row),
            period: { from, to },
            sales: mapped,
            summary: {
                bills: mapped.length,
                pieces: round2(mapped.reduce((s, r) => s + r.pieces, 0)),
                salesAmount: round2(mapped.reduce((s, r) => s + r.salesAmount, 0)),
            },
        };
    }
    async aggregateSales(params) {
        const { start, end } = (0, timezone_1.localRange)(params.from, params.to);
        const employees = await client_1.prisma.employee.findMany({
            where: {
                is_active: true,
                status: { not: 'TERMINATED' },
                user_id: { not: null },
                ...(params.employeeId ? { id: params.employeeId } : {}),
                ...(params.branchId ? { branch_id: params.branchId } : {}),
            },
            select: employeeSelect,
        });
        if (employees.length === 0)
            return [];
        const userIds = employees.map((e) => e.user_id).filter(Boolean);
        const sales = await client_1.prisma.sale.findMany({
            where: {
                created_by: { in: userIds },
                sale_date: { gte: start, lte: end },
                status: { in: INCLUDED_STATUSES },
                ...(params.branchId ? { branch_id: params.branchId } : {}),
            },
            select: {
                id: true,
                created_by: true,
                notes: true,
                sale_items: {
                    select: { quantity: true, line_total: true },
                },
            },
        });
        const byUser = new Map();
        for (const sale of sales) {
            if (!sale.created_by || this.isRegenerated(sale.notes))
                continue;
            const bucket = byUser.get(sale.created_by) || { bills: 0, pieces: 0, salesAmount: 0 };
            bucket.bills += 1;
            for (const item of sale.sale_items) {
                bucket.pieces += num(item.quantity);
                bucket.salesAmount += num(item.line_total);
            }
            byUser.set(sale.created_by, bucket);
        }
        return employees
            .map((employee) => {
            const stats = byUser.get(employee.user_id) || { bills: 0, pieces: 0, salesAmount: 0 };
            const rate = (0, helpers_1.asNumber)(employee.commission_rate);
            const salesAmount = round2(stats.salesAmount);
            const pieces = round2(stats.pieces);
            const commissionAmount = round2(salesAmount * (rate / 100));
            return {
                employeeId: employee.id,
                employee: employee.name,
                code: employee.employee_code,
                designation: employee.employee_type?.name || null,
                userEmail: employee.user?.email || null,
                rate,
                bills: stats.bills,
                pieces,
                salesAmount,
                commissionAmount,
                employeeRaw: employee,
            };
        })
            .filter((row) => row.bills > 0 || row.pieces !== 0 || row.salesAmount !== 0)
            .sort((a, b) => b.commissionAmount - a.commissionAmount || a.employee.localeCompare(b.employee));
    }
    isRegenerated(notes) {
        const text = (notes || '').toLowerCase();
        return text.includes('[regenerated]') || text.includes('regenerated bill');
    }
    serialize(row) {
        return {
            ...row,
            sales_amount: (0, helpers_1.asNumber)(row.sales_amount),
            pieces: (0, helpers_1.asNumber)(row.pieces),
            rate: (0, helpers_1.asNumber)(row.rate),
            amount: (0, helpers_1.asNumber)(row.amount),
            employee: row.employee
                ? {
                    ...row.employee,
                    commission_rate: (0, helpers_1.asNumber)(row.employee.commission_rate),
                }
                : row.employee,
        };
    }
}
exports.CommissionService = CommissionService;
//# sourceMappingURL=commission.service.js.map