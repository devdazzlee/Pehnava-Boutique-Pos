"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeePayrollService = exports.salaryNet = exports.salaryGross = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const helpers_1 = require("../utils/helpers");
const commission_service_1 = require("./commission.service");
const period_lock_service_1 = require("./period-lock.service");
/** Last calendar day of a payslip month as YYYY-MM-DD. */
const monthEnd = (year, month) => `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
/* ============================================================
 * Payroll for the Employees module:
 *   - payslip breakdown (basic + bonus + allowances − deductions − advance recovery)
 *   - partial / full salary payments
 *   - staff advances & loans ledger with salary recovery
 *   - per-employee finance file and month overview with sales + commission
 * ============================================================ */
const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Salary cost to the business (what reports treat as expense). */
const salaryGross = (s) => round2((0, helpers_1.asNumber)(s.amount) + (0, helpers_1.asNumber)(s.bonus) + (0, helpers_1.asNumber)(s.allowances) - (0, helpers_1.asNumber)(s.deductions));
exports.salaryGross = salaryGross;
/** What the employee should receive in hand for the month. */
const salaryNet = (s) => round2(Math.max(0, (0, exports.salaryGross)(s) - (0, helpers_1.asNumber)(s.advance_deduction) - (0, helpers_1.asNumber)(s.loan_amount)));
exports.salaryNet = salaryNet;
const salaryStatus = (net, paid) => paid >= net - 0.005 ? 'PAID' : paid > 0.005 ? 'PARTIAL' : 'UNPAID';
const monthRange = (month, year) => {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const last = new Date(year, month, 0).getDate();
    return { from, to: `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
};
const EMPLOYEE_SELECT = {
    id: true,
    name: true,
    employee_code: true,
    phone_number: true,
    email: true,
    cnic: true,
    photo_url: true,
    status: true,
    is_active: true,
    join_date: true,
    employment_type: true,
    monthly_salary: true,
    commission_type: true,
    commission_rate: true,
    commission_fixed: true,
    user_id: true,
    bank_name: true,
    account_title: true,
    account_number: true,
    iban: true,
    address: true,
    department: { select: { id: true, name: true } },
    employee_type: { select: { id: true, name: true } },
    branch: { select: { id: true, name: true, code: true } },
    user: { select: { id: true, email: true } },
};
class EmployeePayrollService {
    commission = new commission_service_1.CommissionService();
    basisLabel(type, rate, fixed) {
        if (type === 'FIXED_PER_SALE')
            return `Rs ${fixed.toLocaleString('en-US')} per bill`;
        if (type === 'FIXED_PER_PIECE')
            return `Rs ${fixed.toLocaleString('en-US')} per piece`;
        return `${rate}% of sales`;
    }
    serializeEmployee(e) {
        const rate = (0, helpers_1.asNumber)(e.commission_rate);
        const fixed = (0, helpers_1.asNumber)(e.commission_fixed);
        return {
            ...e,
            monthly_salary: (0, helpers_1.asNumber)(e.monthly_salary),
            commission_rate: rate,
            commission_fixed: fixed,
            commission_label: this.basisLabel(e.commission_type, rate, fixed),
        };
    }
    serializeSalary(s) {
        const net = (0, exports.salaryNet)(s);
        const paid = round2((0, helpers_1.asNumber)(s.paid_amount));
        return {
            ...s,
            amount: (0, helpers_1.asNumber)(s.amount),
            bonus: (0, helpers_1.asNumber)(s.bonus),
            allowances: (0, helpers_1.asNumber)(s.allowances),
            deductions: (0, helpers_1.asNumber)(s.deductions),
            advance_deduction: (0, helpers_1.asNumber)(s.advance_deduction),
            loan_amount: (0, helpers_1.asNumber)(s.loan_amount),
            paid_amount: paid,
            gross: (0, exports.salaryGross)(s),
            net_payable: net,
            due: round2(Math.max(0, net - paid)),
            status: salaryStatus(net, paid),
            period_label: `${MONTHS[s.month - 1]} ${s.year}`,
        };
    }
    /* ------------------------------ overview ------------------------------ */
    async overview(params) {
        const isAdmin = params.userRole === 'SUPER_ADMIN' || params.userRole === 'ADMIN';
        const branchId = isAdmin ? params.branchId : params.userBranchId || undefined;
        const { from, to } = monthRange(params.month, params.year);
        const employees = await client_1.prisma.employee.findMany({
            where: branchId ? { branch_id: branchId } : {},
            select: EMPLOYEE_SELECT,
            orderBy: { name: 'asc' },
        });
        const ids = employees.map((e) => e.id);
        const [monthSalaries, allSalaries, advances, unpaidCommission, preview] = await Promise.all([
            client_1.prisma.salary.findMany({ where: { employee_id: { in: ids }, month: params.month, year: params.year } }),
            client_1.prisma.salary.findMany({
                where: { employee_id: { in: ids } },
                select: {
                    employee_id: true,
                    month: true,
                    year: true,
                    amount: true,
                    bonus: true,
                    allowances: true,
                    deductions: true,
                    advance_deduction: true,
                    loan_amount: true,
                    paid_amount: true,
                    paid_date: true,
                },
            }),
            client_1.prisma.employeeAdvance.groupBy({ by: ['employee_id', 'type'], where: { employee_id: { in: ids } }, _sum: { amount: true } }),
            client_1.prisma.commission.groupBy({
                by: ['employee_id'],
                where: { employee_id: { in: ids }, is_paid: false },
                _sum: { amount: true },
            }),
            this.commission.preview({ from, to, branch_id: branchId, userRole: 'SUPER_ADMIN' }),
        ]);
        const monthBy = new Map(monthSalaries.map((s) => [s.employee_id, this.serializeSalary(s)]));
        const salaryTotals = new Map();
        for (const s of allSalaries) {
            const t = salaryTotals.get(s.employee_id) || { paid: 0, due: 0, lastPaid: null };
            const net = (0, exports.salaryNet)(s);
            const paid = (0, helpers_1.asNumber)(s.paid_amount);
            t.paid += paid;
            t.due += Math.max(0, net - paid);
            if (s.paid_date && (!t.lastPaid || s.paid_date > t.lastPaid))
                t.lastPaid = s.paid_date;
            salaryTotals.set(s.employee_id, t);
        }
        const advanceBy = new Map();
        for (const row of advances) {
            const sign = row.type === 'ADVANCE' ? 1 : -1;
            advanceBy.set(row.employee_id, (advanceBy.get(row.employee_id) || 0) + sign * (0, helpers_1.asNumber)(row._sum.amount));
        }
        const commissionDueBy = new Map(unpaidCommission.map((r) => [r.employee_id, (0, helpers_1.asNumber)(r._sum.amount)]));
        const salesBy = new Map(preview.rows.map((r) => [r.employeeId, r]));
        const rows = employees.map((e) => {
            const emp = this.serializeEmployee(e);
            const slip = monthBy.get(e.id) || null;
            const totals = salaryTotals.get(e.id) || { paid: 0, due: 0, lastPaid: null };
            const sales = salesBy.get(e.id);
            return {
                ...emp,
                month_salary: slip,
                salary_paid_total: round2(totals.paid),
                salary_due_total: round2(totals.due),
                last_paid_date: totals.lastPaid,
                advance_balance: round2(advanceBy.get(e.id) || 0),
                commission_due: round2(commissionDueBy.get(e.id) || 0),
                month_sales: sales
                    ? { bills: sales.bills, pieces: sales.pieces, sales: sales.salesAmount, commission: sales.commissionAmount }
                    : { bills: 0, pieces: 0, sales: 0, commission: 0 },
            };
        });
        const active = rows.filter((r) => r.is_active && r.status !== 'TERMINATED');
        const sum = (list, pick) => round2(list.reduce((s, r) => s + pick(r), 0));
        const slips = rows.filter((r) => r.month_salary);
        return {
            period: { month: params.month, year: params.year, label: `${MONTHS[params.month - 1]} ${params.year}`, from, to },
            totals: {
                headcount: rows.length,
                active: active.length,
                monthlyPayroll: sum(active, (r) => r.monthly_salary),
                slipsGenerated: slips.length,
                slipsMissing: active.filter((r) => !r.month_salary && r.monthly_salary > 0).length,
                monthNet: sum(slips, (r) => r.month_salary?.net_payable ?? 0),
                monthPaid: sum(slips, (r) => r.month_salary?.paid_amount ?? 0),
                monthDue: sum(slips, (r) => r.month_salary?.due ?? 0),
                salaryDueAll: sum(rows, (r) => r.salary_due_total),
                advancesOutstanding: sum(rows, (r) => Math.max(0, r.advance_balance)),
                monthSales: sum(rows, (r) => r.month_sales.sales),
                monthBills: rows.reduce((s, r) => s + r.month_sales.bills, 0),
                monthCommission: sum(rows, (r) => r.month_sales.commission),
                commissionDue: sum(rows, (r) => r.commission_due),
            },
            employees: rows,
        };
    }
    /* ------------------------------ finance file ------------------------------ */
    async finance(employeeId) {
        const employee = await client_1.prisma.employee.findUnique({ where: { id: employeeId }, select: EMPLOYEE_SELECT });
        if (!employee)
            throw new apiError_1.AppError(404, 'Employee not found');
        const [salaries, advances, commissions] = await Promise.all([
            client_1.prisma.salary.findMany({ where: { employee_id: employeeId }, orderBy: [{ year: 'desc' }, { month: 'desc' }] }),
            client_1.prisma.employeeAdvance.findMany({ where: { employee_id: employeeId }, orderBy: [{ txn_date: 'asc' }, { created_at: 'asc' }] }),
            client_1.prisma.commission.findMany({ where: { employee_id: employeeId }, orderBy: [{ year: 'desc' }, { month: 'desc' }] }),
        ]);
        const commissionBy = new Map(commissions.map((c) => [`${c.month}-${c.year}`, c]));
        const slips = salaries.map((s) => {
            const row = this.serializeSalary(s);
            const c = commissionBy.get(`${s.month}-${s.year}`);
            return {
                ...row,
                commission: c ? { id: c.id, amount: (0, helpers_1.asNumber)(c.amount), is_paid: c.is_paid, sales_amount: (0, helpers_1.asNumber)(c.sales_amount) } : null,
            };
        });
        let running = 0;
        const ledger = advances.map((a) => {
            const amount = (0, helpers_1.asNumber)(a.amount);
            running += a.type === 'ADVANCE' ? amount : -amount;
            return { ...a, amount, balance: round2(running) };
        });
        const year = new Date().getFullYear();
        const ytd = slips.filter((s) => s.year === year);
        const commissionRows = commissions.map((c) => ({
            id: c.id,
            month: c.month,
            year: c.year,
            period_label: `${MONTHS[c.month - 1]} ${c.year}`,
            sales_amount: (0, helpers_1.asNumber)(c.sales_amount),
            bills: c.bills,
            pieces: (0, helpers_1.asNumber)(c.pieces),
            amount: (0, helpers_1.asNumber)(c.amount),
            commission_type: c.commission_type,
            rate: (0, helpers_1.asNumber)(c.rate),
            fixed_amount: (0, helpers_1.asNumber)(c.fixed_amount),
            is_paid: c.is_paid,
            paid_date: c.paid_date,
        }));
        return {
            employee: this.serializeEmployee(employee),
            totals: {
                salaryPaidLifetime: round2(slips.reduce((s, r) => s + r.paid_amount, 0)),
                salaryDue: round2(slips.reduce((s, r) => s + r.due, 0)),
                ytdGross: round2(ytd.reduce((s, r) => s + r.gross, 0)),
                ytdPaid: round2(ytd.reduce((s, r) => s + r.paid_amount, 0)),
                bonusesLifetime: round2(slips.reduce((s, r) => s + r.bonus, 0)),
                deductionsLifetime: round2(slips.reduce((s, r) => s + r.deductions, 0)),
                commissionEarned: round2(commissionRows.reduce((s, r) => s + r.amount, 0)),
                commissionPaid: round2(commissionRows.filter((r) => r.is_paid).reduce((s, r) => s + r.amount, 0)),
                commissionDue: round2(commissionRows.filter((r) => !r.is_paid).reduce((s, r) => s + r.amount, 0)),
                advanceGiven: round2(ledger.filter((l) => l.type === 'ADVANCE').reduce((s, l) => s + l.amount, 0)),
                advanceRecovered: round2(ledger.filter((l) => l.type === 'RECOVERY').reduce((s, l) => s + l.amount, 0)),
                advanceBalance: round2(running),
                slipCount: slips.length,
            },
            salaries: slips,
            advances: [...ledger].reverse(),
            commissions: commissionRows,
        };
    }
    /* ------------------------------ payroll run ------------------------------ */
    async generate(params) {
        const employees = await client_1.prisma.employee.findMany({
            where: {
                is_active: true,
                status: { in: ['ACTIVE', 'ON_LEAVE'] },
                monthly_salary: { gt: 0 },
                ...(params.employeeIds?.length ? { id: { in: params.employeeIds } } : {}),
                ...(params.branchId ? { branch_id: params.branchId } : {}),
            },
            select: { id: true, name: true, monthly_salary: true },
        });
        const existing = await client_1.prisma.salary.findMany({
            where: { employee_id: { in: employees.map((e) => e.id) }, month: params.month, year: params.year },
            select: { employee_id: true },
        });
        const has = new Set(existing.map((e) => e.employee_id));
        const toCreate = employees.filter((e) => !has.has(e.id));
        if (toCreate.length) {
            await client_1.prisma.salary.createMany({
                data: toCreate.map((e) => ({
                    employee_id: e.id,
                    month: params.month,
                    year: params.year,
                    amount: e.monthly_salary,
                    notes: 'Generated by payroll run',
                })),
                skipDuplicates: true,
            });
        }
        return { created: toCreate.length, skipped: employees.length - toCreate.length, names: toCreate.map((e) => e.name) };
    }
    /* ------------------------------ payslips ------------------------------ */
    async advanceBalance(employeeId, excludeSalaryId) {
        const rows = await client_1.prisma.employeeAdvance.groupBy({
            by: ['type'],
            where: { employee_id: employeeId, ...(excludeSalaryId ? { NOT: { salary_id: excludeSalaryId } } : {}) },
            _sum: { amount: true },
        });
        const given = (0, helpers_1.asNumber)(rows.find((r) => r.type === 'ADVANCE')?._sum.amount);
        const back = (0, helpers_1.asNumber)(rows.find((r) => r.type === 'RECOVERY')?._sum.amount);
        return round2(given - back);
    }
    /** Keeps the RECOVERY ledger entry in step with a payslip's advance deduction. */
    async syncRecovery(salaryId, employeeId, amount, period, userId) {
        await client_1.prisma.employeeAdvance.deleteMany({ where: { salary_id: salaryId } });
        if (amount > 0.005) {
            await client_1.prisma.employeeAdvance.create({
                data: {
                    employee_id: employeeId,
                    type: 'RECOVERY',
                    amount,
                    method: 'SALARY',
                    salary_id: salaryId,
                    notes: `Deducted from ${period} salary`,
                    created_by: userId ?? null,
                },
            });
        }
    }
    validateMoney(data) {
        for (const key of ['amount', 'bonus', 'allowances', 'deductions', 'advance_deduction']) {
            const v = data[key];
            if (v !== undefined && (!Number.isFinite(v) || v < 0))
                throw new apiError_1.AppError(400, `${key.replace('_', ' ')} cannot be negative`);
        }
    }
    async createPayslip(data, userId) {
        this.validateMoney(data);
        await (0, period_lock_service_1.assertPeriodOpen)(monthEnd(data.year, data.month), 'a payslip');
        const employee = await client_1.prisma.employee.findUnique({ where: { id: data.employee_id }, select: { id: true, name: true, monthly_salary: true } });
        if (!employee)
            throw new apiError_1.AppError(404, 'Employee not found');
        const clash = await client_1.prisma.salary.findUnique({
            where: { employee_id_month_year: { employee_id: data.employee_id, month: data.month, year: data.year } },
        });
        if (clash)
            throw new apiError_1.AppError(400, `${employee.name} already has a payslip for ${MONTHS[data.month - 1]} ${data.year}`);
        const amount = data.amount ?? (0, helpers_1.asNumber)(employee.monthly_salary);
        if (!(amount > 0))
            throw new apiError_1.AppError(400, 'Set a basic salary (or a monthly salary on the employee profile)');
        const recovery = data.advance_deduction ?? 0;
        if (recovery > 0) {
            const balance = await this.advanceBalance(employee.id);
            if (recovery > balance + 0.005)
                throw new apiError_1.AppError(400, `Advance recovery exceeds the outstanding advance (Rs ${balance.toLocaleString()})`);
        }
        const salary = await client_1.prisma.salary.create({
            data: {
                employee_id: employee.id,
                month: data.month,
                year: data.year,
                amount,
                bonus: data.bonus ?? 0,
                allowances: data.allowances ?? 0,
                deductions: data.deductions ?? 0,
                advance_deduction: recovery,
                notes: data.notes?.trim() || null,
            },
        });
        await this.syncRecovery(salary.id, employee.id, recovery, `${MONTHS[data.month - 1]} ${data.year}`, userId);
        return this.serializeSalary(salary);
    }
    async updatePayslip(id, data, userId) {
        this.validateMoney(data);
        const existing = await client_1.prisma.salary.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Payslip not found');
        await (0, period_lock_service_1.assertPeriodOpen)(monthEnd(existing.year, existing.month), 'a payslip');
        if (data.amount !== undefined && !(data.amount > 0))
            throw new apiError_1.AppError(400, 'Basic salary must be greater than 0');
        const recovery = data.advance_deduction ?? (0, helpers_1.asNumber)(existing.advance_deduction);
        if (data.advance_deduction !== undefined && recovery > 0) {
            const balance = await this.advanceBalance(existing.employee_id, id);
            if (recovery > balance + 0.005)
                throw new apiError_1.AppError(400, `Advance recovery exceeds the outstanding advance (Rs ${balance.toLocaleString()})`);
        }
        const next = {
            amount: data.amount ?? existing.amount,
            bonus: data.bonus ?? existing.bonus,
            allowances: data.allowances ?? existing.allowances,
            deductions: data.deductions ?? existing.deductions,
            advance_deduction: recovery,
            loan_amount: existing.loan_amount,
            paid_amount: existing.paid_amount,
        };
        const net = (0, exports.salaryNet)(next);
        const paid = Math.min((0, helpers_1.asNumber)(existing.paid_amount), net);
        const salary = await client_1.prisma.salary.update({
            where: { id },
            data: {
                amount: next.amount,
                bonus: next.bonus,
                allowances: next.allowances,
                deductions: next.deductions,
                advance_deduction: recovery,
                paid_amount: paid,
                is_paid: paid >= net - 0.005 && paid > 0,
                ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
            },
        });
        if (data.advance_deduction !== undefined) {
            await this.syncRecovery(id, existing.employee_id, recovery, `${MONTHS[existing.month - 1]} ${existing.year}`, userId);
        }
        return this.serializeSalary(salary);
    }
    async pay(id, data) {
        const existing = await client_1.prisma.salary.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Payslip not found');
        await (0, period_lock_service_1.assertPeriodOpen)(data.date ? data.date.slice(0, 10) : new Date(), 'a salary payment');
        const net = (0, exports.salaryNet)(existing);
        const alreadyPaid = (0, helpers_1.asNumber)(existing.paid_amount);
        const remaining = round2(Math.max(0, net - alreadyPaid));
        if (remaining <= 0.005)
            throw new apiError_1.AppError(400, 'This payslip is already fully paid');
        const amount = data.amount ?? remaining;
        if (!(amount > 0))
            throw new apiError_1.AppError(400, 'Payment must be greater than 0');
        if (amount > remaining + 0.005)
            throw new apiError_1.AppError(400, `Only Rs ${remaining.toLocaleString()} is left to pay on this payslip`);
        const paid = round2(alreadyPaid + amount);
        const full = paid >= net - 0.005;
        const salary = await client_1.prisma.salary.update({
            where: { id },
            data: {
                paid_amount: paid,
                is_paid: full,
                paid_date: data.date ? new Date(data.date) : new Date(),
                payment_method: data.method || existing.payment_method || 'CASH',
                ...(data.reference !== undefined ? { reference: data.reference || null } : {}),
            },
        });
        return this.serializeSalary(salary);
    }
    async undoPayment(id) {
        const existing = await client_1.prisma.salary.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Payslip not found');
        const salary = await client_1.prisma.salary.update({
            where: { id },
            data: { paid_amount: 0, is_paid: false, paid_date: null },
        });
        return this.serializeSalary(salary);
    }
    async deletePayslip(id) {
        const existing = await client_1.prisma.salary.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Payslip not found');
        await (0, period_lock_service_1.assertPeriodOpen)(monthEnd(existing.year, existing.month), 'a payslip');
        if ((0, helpers_1.asNumber)(existing.paid_amount) > 0.005) {
            throw new apiError_1.AppError(400, 'Undo the payment before deleting a paid payslip');
        }
        await client_1.prisma.salary.delete({ where: { id } }); // linked recovery entries cascade
        return { id };
    }
    /* ------------------------------ advances ------------------------------ */
    async addAdvance(data, userId) {
        const employee = await client_1.prisma.employee.findUnique({ where: { id: data.employee_id }, select: { id: true } });
        if (!employee)
            throw new apiError_1.AppError(404, 'Employee not found');
        if (!(data.amount > 0))
            throw new apiError_1.AppError(400, 'Amount must be greater than 0');
        if (data.type === 'RECOVERY') {
            const balance = await this.advanceBalance(employee.id);
            if (data.amount > balance + 0.005)
                throw new apiError_1.AppError(400, `Recovery exceeds the outstanding advance (Rs ${balance.toLocaleString()})`);
        }
        const row = await client_1.prisma.employeeAdvance.create({
            data: {
                employee_id: employee.id,
                type: data.type,
                amount: data.amount,
                txn_date: data.date ? new Date(data.date) : new Date(),
                method: data.method || 'CASH',
                reference: data.reference || null,
                notes: data.notes?.trim() || null,
                created_by: userId ?? null,
            },
        });
        return { ...row, amount: (0, helpers_1.asNumber)(row.amount) };
    }
    async deleteAdvance(id) {
        const row = await client_1.prisma.employeeAdvance.findUnique({ where: { id } });
        if (!row)
            throw new apiError_1.AppError(404, 'Entry not found');
        if (row.salary_id)
            throw new apiError_1.AppError(400, 'This recovery comes from a payslip — change the advance deduction on that payslip instead');
        await client_1.prisma.employeeAdvance.delete({ where: { id } });
        return { id };
    }
}
exports.EmployeePayrollService = EmployeePayrollService;
//# sourceMappingURL=employee-payroll.service.js.map