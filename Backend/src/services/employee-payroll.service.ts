import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { asNumber } from '../utils/helpers';
import { CommissionService } from './commission.service';

/* ============================================================
 * Payroll for the Employees module:
 *   - payslip breakdown (basic + bonus + allowances − deductions − advance recovery)
 *   - partial / full salary payments
 *   - staff advances & loans ledger with salary recovery
 *   - per-employee finance file and month overview with sales + commission
 * ============================================================ */

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type SalaryLike = {
  amount: Prisma.Decimal | number;
  bonus: Prisma.Decimal | number;
  allowances: Prisma.Decimal | number;
  deductions: Prisma.Decimal | number;
  advance_deduction: Prisma.Decimal | number;
  loan_amount: Prisma.Decimal | number;
  paid_amount: Prisma.Decimal | number;
};

/** Salary cost to the business (what reports treat as expense). */
export const salaryGross = (s: Omit<SalaryLike, 'advance_deduction' | 'loan_amount' | 'paid_amount'>) =>
  round2(asNumber(s.amount as never) + asNumber(s.bonus as never) + asNumber(s.allowances as never) - asNumber(s.deductions as never));

/** What the employee should receive in hand for the month. */
export const salaryNet = (s: SalaryLike) =>
  round2(Math.max(0, salaryGross(s) - asNumber(s.advance_deduction as never) - asNumber(s.loan_amount as never)));

const salaryStatus = (net: number, paid: number) =>
  paid >= net - 0.005 ? 'PAID' : paid > 0.005 ? 'PARTIAL' : 'UNPAID';

const monthRange = (month: number, year: number) => {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(year, month, 0).getDate();
  return { from, to: `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
};

export type PayslipInput = {
  employee_id: string;
  month: number;
  year: number;
  amount?: number;
  bonus?: number;
  allowances?: number;
  deductions?: number;
  advance_deduction?: number;
  notes?: string | null;
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
} satisfies Prisma.EmployeeSelect;

export class EmployeePayrollService {
  private commission = new CommissionService();

  private basisLabel(type: string, rate: number, fixed: number) {
    if (type === 'FIXED_PER_SALE') return `Rs ${fixed.toLocaleString('en-US')} per bill`;
    if (type === 'FIXED_PER_PIECE') return `Rs ${fixed.toLocaleString('en-US')} per piece`;
    return `${rate}% of sales`;
  }

  private serializeEmployee(e: Prisma.EmployeeGetPayload<{ select: typeof EMPLOYEE_SELECT }>) {
    const rate = asNumber(e.commission_rate);
    const fixed = asNumber(e.commission_fixed);
    return {
      ...e,
      monthly_salary: asNumber(e.monthly_salary),
      commission_rate: rate,
      commission_fixed: fixed,
      commission_label: this.basisLabel(e.commission_type, rate, fixed),
    };
  }

  serializeSalary<T extends SalaryLike & { month: number; year: number }>(s: T) {
    const net = salaryNet(s);
    const paid = round2(asNumber(s.paid_amount as never));
    return {
      ...s,
      amount: asNumber(s.amount as never),
      bonus: asNumber(s.bonus as never),
      allowances: asNumber(s.allowances as never),
      deductions: asNumber(s.deductions as never),
      advance_deduction: asNumber(s.advance_deduction as never),
      loan_amount: asNumber(s.loan_amount as never),
      paid_amount: paid,
      gross: salaryGross(s),
      net_payable: net,
      due: round2(Math.max(0, net - paid)),
      status: salaryStatus(net, paid),
      period_label: `${MONTHS[s.month - 1]} ${s.year}`,
    };
  }

  /* ------------------------------ overview ------------------------------ */

  async overview(params: { month: number; year: number; branchId?: string; userRole?: string; userBranchId?: string | null }) {
    const isAdmin = params.userRole === 'SUPER_ADMIN' || params.userRole === 'ADMIN';
    const branchId = isAdmin ? params.branchId : params.userBranchId || undefined;
    const { from, to } = monthRange(params.month, params.year);

    const employees = await prisma.employee.findMany({
      where: branchId ? { branch_id: branchId } : {},
      select: EMPLOYEE_SELECT,
      orderBy: { name: 'asc' },
    });
    const ids = employees.map((e) => e.id);

    const [monthSalaries, allSalaries, advances, unpaidCommission, preview] = await Promise.all([
      prisma.salary.findMany({ where: { employee_id: { in: ids }, month: params.month, year: params.year } }),
      prisma.salary.findMany({
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
      prisma.employeeAdvance.groupBy({ by: ['employee_id', 'type'], where: { employee_id: { in: ids } }, _sum: { amount: true } }),
      prisma.commission.groupBy({
        by: ['employee_id'],
        where: { employee_id: { in: ids }, is_paid: false },
        _sum: { amount: true },
      }),
      this.commission.preview({ from, to, branch_id: branchId, userRole: 'SUPER_ADMIN' }),
    ]);

    const monthBy = new Map(monthSalaries.map((s) => [s.employee_id, this.serializeSalary(s)]));
    const salaryTotals = new Map<string, { paid: number; due: number; lastPaid: Date | null }>();
    for (const s of allSalaries) {
      const t = salaryTotals.get(s.employee_id) || { paid: 0, due: 0, lastPaid: null };
      const net = salaryNet(s);
      const paid = asNumber(s.paid_amount);
      t.paid += paid;
      t.due += Math.max(0, net - paid);
      if (s.paid_date && (!t.lastPaid || s.paid_date > t.lastPaid)) t.lastPaid = s.paid_date;
      salaryTotals.set(s.employee_id, t);
    }
    const advanceBy = new Map<string, number>();
    for (const row of advances) {
      const sign = row.type === 'ADVANCE' ? 1 : -1;
      advanceBy.set(row.employee_id, (advanceBy.get(row.employee_id) || 0) + sign * asNumber(row._sum.amount));
    }
    const commissionDueBy = new Map(unpaidCommission.map((r) => [r.employee_id, asNumber(r._sum.amount)]));
    const salesBy = new Map(preview.rows.map((r: any) => [r.employeeId, r]));

    const rows = employees.map((e) => {
      const emp = this.serializeEmployee(e);
      const slip = monthBy.get(e.id) || null;
      const totals = salaryTotals.get(e.id) || { paid: 0, due: 0, lastPaid: null };
      const sales = salesBy.get(e.id) as any;
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
    const sum = (list: typeof rows, pick: (r: (typeof rows)[number]) => number) => round2(list.reduce((s, r) => s + pick(r), 0));
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

  async finance(employeeId: string) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: EMPLOYEE_SELECT });
    if (!employee) throw new AppError(404, 'Employee not found');

    const [salaries, advances, commissions] = await Promise.all([
      prisma.salary.findMany({ where: { employee_id: employeeId }, orderBy: [{ year: 'desc' }, { month: 'desc' }] }),
      prisma.employeeAdvance.findMany({ where: { employee_id: employeeId }, orderBy: [{ txn_date: 'asc' }, { created_at: 'asc' }] }),
      prisma.commission.findMany({ where: { employee_id: employeeId }, orderBy: [{ year: 'desc' }, { month: 'desc' }] }),
    ]);

    const commissionBy = new Map(commissions.map((c) => [`${c.month}-${c.year}`, c]));
    const slips = salaries.map((s) => {
      const row = this.serializeSalary(s);
      const c = commissionBy.get(`${s.month}-${s.year}`);
      return {
        ...row,
        commission: c ? { id: c.id, amount: asNumber(c.amount), is_paid: c.is_paid, sales_amount: asNumber(c.sales_amount) } : null,
      };
    });

    let running = 0;
    const ledger = advances.map((a) => {
      const amount = asNumber(a.amount);
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
      sales_amount: asNumber(c.sales_amount),
      bills: c.bills,
      pieces: asNumber(c.pieces),
      amount: asNumber(c.amount),
      commission_type: c.commission_type,
      rate: asNumber(c.rate),
      fixed_amount: asNumber(c.fixed_amount),
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

  async generate(params: { month: number; year: number; employeeIds?: string[]; branchId?: string }) {
    const employees = await prisma.employee.findMany({
      where: {
        is_active: true,
        status: { in: ['ACTIVE', 'ON_LEAVE'] },
        monthly_salary: { gt: 0 },
        ...(params.employeeIds?.length ? { id: { in: params.employeeIds } } : {}),
        ...(params.branchId ? { branch_id: params.branchId } : {}),
      },
      select: { id: true, name: true, monthly_salary: true },
    });
    const existing = await prisma.salary.findMany({
      where: { employee_id: { in: employees.map((e) => e.id) }, month: params.month, year: params.year },
      select: { employee_id: true },
    });
    const has = new Set(existing.map((e) => e.employee_id));
    const toCreate = employees.filter((e) => !has.has(e.id));
    if (toCreate.length) {
      await prisma.salary.createMany({
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

  private async advanceBalance(employeeId: string, excludeSalaryId?: string) {
    const rows = await prisma.employeeAdvance.groupBy({
      by: ['type'],
      where: { employee_id: employeeId, ...(excludeSalaryId ? { NOT: { salary_id: excludeSalaryId } } : {}) },
      _sum: { amount: true },
    });
    const given = asNumber(rows.find((r) => r.type === 'ADVANCE')?._sum.amount);
    const back = asNumber(rows.find((r) => r.type === 'RECOVERY')?._sum.amount);
    return round2(given - back);
  }

  /** Keeps the RECOVERY ledger entry in step with a payslip's advance deduction. */
  private async syncRecovery(salaryId: string, employeeId: string, amount: number, period: string, userId?: string) {
    await prisma.employeeAdvance.deleteMany({ where: { salary_id: salaryId } });
    if (amount > 0.005) {
      await prisma.employeeAdvance.create({
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

  private validateMoney(data: Partial<PayslipInput>) {
    for (const key of ['amount', 'bonus', 'allowances', 'deductions', 'advance_deduction'] as const) {
      const v = data[key];
      if (v !== undefined && (!Number.isFinite(v) || v < 0)) throw new AppError(400, `${key.replace('_', ' ')} cannot be negative`);
    }
  }

  async createPayslip(data: PayslipInput, userId?: string) {
    this.validateMoney(data);
    const employee = await prisma.employee.findUnique({ where: { id: data.employee_id }, select: { id: true, name: true, monthly_salary: true } });
    if (!employee) throw new AppError(404, 'Employee not found');
    const clash = await prisma.salary.findUnique({
      where: { employee_id_month_year: { employee_id: data.employee_id, month: data.month, year: data.year } },
    });
    if (clash) throw new AppError(400, `${employee.name} already has a payslip for ${MONTHS[data.month - 1]} ${data.year}`);

    const amount = data.amount ?? asNumber(employee.monthly_salary);
    if (!(amount > 0)) throw new AppError(400, 'Set a basic salary (or a monthly salary on the employee profile)');
    const recovery = data.advance_deduction ?? 0;
    if (recovery > 0) {
      const balance = await this.advanceBalance(employee.id);
      if (recovery > balance + 0.005) throw new AppError(400, `Advance recovery exceeds the outstanding advance (Rs ${balance.toLocaleString()})`);
    }

    const salary = await prisma.salary.create({
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

  async updatePayslip(id: string, data: Partial<PayslipInput>, userId?: string) {
    this.validateMoney(data);
    const existing = await prisma.salary.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Payslip not found');
    if (data.amount !== undefined && !(data.amount > 0)) throw new AppError(400, 'Basic salary must be greater than 0');
    const recovery = data.advance_deduction ?? asNumber(existing.advance_deduction);
    if (data.advance_deduction !== undefined && recovery > 0) {
      const balance = await this.advanceBalance(existing.employee_id, id);
      if (recovery > balance + 0.005) throw new AppError(400, `Advance recovery exceeds the outstanding advance (Rs ${balance.toLocaleString()})`);
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
    const net = salaryNet(next);
    const paid = Math.min(asNumber(existing.paid_amount), net);

    const salary = await prisma.salary.update({
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

  async pay(id: string, data: { amount?: number; method?: string; date?: string; reference?: string | null }) {
    const existing = await prisma.salary.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Payslip not found');
    const net = salaryNet(existing);
    const alreadyPaid = asNumber(existing.paid_amount);
    const remaining = round2(Math.max(0, net - alreadyPaid));
    if (remaining <= 0.005) throw new AppError(400, 'This payslip is already fully paid');
    const amount = data.amount ?? remaining;
    if (!(amount > 0)) throw new AppError(400, 'Payment must be greater than 0');
    if (amount > remaining + 0.005) throw new AppError(400, `Only Rs ${remaining.toLocaleString()} is left to pay on this payslip`);

    const paid = round2(alreadyPaid + amount);
    const full = paid >= net - 0.005;
    const salary = await prisma.salary.update({
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

  async undoPayment(id: string) {
    const existing = await prisma.salary.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Payslip not found');
    const salary = await prisma.salary.update({
      where: { id },
      data: { paid_amount: 0, is_paid: false, paid_date: null },
    });
    return this.serializeSalary(salary);
  }

  async deletePayslip(id: string) {
    const existing = await prisma.salary.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Payslip not found');
    if (asNumber(existing.paid_amount) > 0.005) {
      throw new AppError(400, 'Undo the payment before deleting a paid payslip');
    }
    await prisma.salary.delete({ where: { id } }); // linked recovery entries cascade
    return { id };
  }

  /* ------------------------------ advances ------------------------------ */

  async addAdvance(data: {
    employee_id: string;
    type: 'ADVANCE' | 'RECOVERY';
    amount: number;
    date?: string;
    method?: string;
    reference?: string | null;
    notes?: string | null;
  }, userId?: string) {
    const employee = await prisma.employee.findUnique({ where: { id: data.employee_id }, select: { id: true } });
    if (!employee) throw new AppError(404, 'Employee not found');
    if (!(data.amount > 0)) throw new AppError(400, 'Amount must be greater than 0');
    if (data.type === 'RECOVERY') {
      const balance = await this.advanceBalance(employee.id);
      if (data.amount > balance + 0.005) throw new AppError(400, `Recovery exceeds the outstanding advance (Rs ${balance.toLocaleString()})`);
    }
    const row = await prisma.employeeAdvance.create({
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
    return { ...row, amount: asNumber(row.amount) };
  }

  async deleteAdvance(id: string) {
    const row = await prisma.employeeAdvance.findUnique({ where: { id } });
    if (!row) throw new AppError(404, 'Entry not found');
    if (row.salary_id) throw new AppError(400, 'This recovery comes from a payslip — change the advance deduction on that payslip instead');
    await prisma.employeeAdvance.delete({ where: { id } });
    return { id };
  }
}
