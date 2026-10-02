import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { asNumber } from '../utils/helpers';
import { localRange } from '../utils/timezone';
import { salaryNet } from './employee-payroll.service';
import { CreateSalaryInput, UpdateSalaryInput } from '../validations/salary.validation';

export class SalaryService {
  async createSalary(data: CreateSalaryInput) {
    const employee = await prisma.employee.findUnique({
      where: { id: data.employee_id },
      select: { id: true, name: true, monthly_salary: true },
    });
    if (!employee) throw new AppError(404, 'Employee not found');

    const existing = await prisma.salary.findUnique({
      where: {
        employee_id_month_year: {
          employee_id: data.employee_id,
          month: data.month,
          year: data.year,
        },
      },
    });
    if (existing) {
      throw new AppError(
        400,
        `A salary record already exists for ${employee.name} in ${data.month}/${data.year}`,
      );
    }

    const amount =
      data.amount !== undefined && data.amount !== null
        ? asNumber(data.amount)
        : asNumber(employee.monthly_salary);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError(
        400,
        'Set a fixed monthly salary on the employee profile, or provide an amount',
      );
    }

    const isPaid = data.is_paid ?? false;
    const paidDate = isPaid
      ? data.paid_date
        ? new Date(data.paid_date)
        : new Date()
      : null;

    const salary = await prisma.salary.create({
      data: {
        employee_id: data.employee_id,
        month: data.month,
        year: data.year,
        amount,
        loan_amount: data.loan_amount ?? 0,
        is_paid: isPaid,
        paid_amount: isPaid ? Math.max(0, amount - (data.loan_amount ?? 0)) : 0,
        paid_date: paidDate,
        notes: data.notes || null,
      },
      include: this.employeeInclude,
    });

    return this.enrichWithCommission(this.serialize(salary));
  }

  async listSalaries(params: {
    branch_id?: string;
    page?: number;
    limit?: number;
    employee_id?: string;
    month?: number;
    year?: number;
    is_paid?: boolean;
    search?: string;
    fetch_all?: boolean;
    paid_from?: string;
    paid_to?: string;
  }) {
    const page = params.page || 1;
    const limit = params.fetch_all ? 500 : params.limit || 20;
    const skip = params.fetch_all ? 0 : (page - 1) * limit;

    const where: Prisma.SalaryWhereInput = {};
    if (params.employee_id) where.employee_id = params.employee_id;
    if (params.month) where.month = params.month;
    if (params.year) where.year = params.year;
    if (params.is_paid !== undefined) where.is_paid = params.is_paid;

    if (params.paid_from || params.paid_to) {
      const from = params.paid_from || '2000-01-01';
      const to = params.paid_to || '2100-12-31';
      const { start, end } = localRange(from, to);
      where.paid_date = { gte: start, lte: end };
    }

    const employeeWhere: Prisma.EmployeeWhereInput = {};
    if (params.branch_id) employeeWhere.branch_id = params.branch_id;
    if (params.search?.trim()) {
      employeeWhere.OR = [
        { name: { contains: params.search.trim(), mode: 'insensitive' } },
        { employee_code: { contains: params.search.trim(), mode: 'insensitive' } },
      ];
    }
    if (Object.keys(employeeWhere).length > 0) {
      where.employee = employeeWhere;
    }

    const [salaries, total, aggregates, paidCount, paidSum, unpaidSum, loanSum] =
      await Promise.all([
        prisma.salary.findMany({
          where,
          include: this.employeeInclude,
          skip,
          take: limit,
          orderBy: [{ year: 'desc' }, { month: 'desc' }, { created_at: 'desc' }],
        }),
        prisma.salary.count({ where }),
        prisma.salary.aggregate({
          where,
          _sum: { amount: true, loan_amount: true },
        }),
        prisma.salary.count({ where: { ...where, is_paid: true } }),
        prisma.salary.aggregate({
          where: { ...where, is_paid: true },
          _sum: { amount: true },
        }),
        prisma.salary.aggregate({
          where: { ...where, is_paid: false },
          _sum: { amount: true },
        }),
        prisma.salary.aggregate({
          where,
          _sum: { loan_amount: true },
        }),
      ]);

    const rows = salaries.map((s) => this.serialize(s));
    const employeeIds = [...new Set(rows.map((r) => r.employee_id))];

    const commissionKeys = rows.map((r) => ({
      employee_id: r.employee_id as string,
      month: r.month as number,
      year: r.year as number,
    }));
    const commissions =
      commissionKeys.length > 0
        ? await prisma.commission.findMany({
            where: {
              OR: commissionKeys.map((k) => ({
                employee_id: k.employee_id,
                month: k.month,
                year: k.year,
              })),
            },
            select: {
              employee_id: true,
              month: true,
              year: true,
              amount: true,
              rate: true,
              is_paid: true,
            },
          })
        : [];
    const commissionMap = new Map(
      commissions.map((c) => [
        `${c.employee_id}:${c.month}:${c.year}`,
        c,
      ]),
    );
    for (const row of rows) {
      const c = commissionMap.get(`${row.employee_id}:${row.month}:${row.year}`);
      row.commission_amount = c ? asNumber(c.amount) : 0;
      row.commission_rate = c
        ? asNumber(c.rate)
        : asNumber(row.employee?.commission_rate);
      row.commission_is_paid = c ? !!c.is_paid : false;
      row.total_with_commission =
        asNumber(row.amount) + asNumber(row.commission_amount);
    }

    let employeeTotals: {
      employeeId: string;
      name: string;
      code: string | null;
      totalSalary: number;
      totalPaid: number;
      totalUnpaid: number;
      totalLoan: number;
    } | null = null;

    if (params.employee_id && employeeIds.length === 1) {
      const emp = rows[0]?.employee;
      employeeTotals = {
        employeeId: params.employee_id,
        name: emp?.name || 'Employee',
        code: emp?.employee_code || null,
        totalSalary: asNumber(aggregates._sum.amount),
        totalPaid: asNumber(paidSum._sum.amount),
        totalUnpaid: asNumber(unpaidSum._sum.amount),
        totalLoan: asNumber(loanSum._sum.loan_amount),
      };
    }

    return {
      data: rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        summary: {
          totalAmount: asNumber(aggregates._sum.amount),
          paidAmount: asNumber(paidSum._sum.amount),
          unpaidAmount: asNumber(unpaidSum._sum.amount),
          loanAmount: asNumber(loanSum._sum.loan_amount),
          netPayable: asNumber(aggregates._sum.amount) - asNumber(loanSum._sum.loan_amount),
          paidCount,
          unpaidCount: total - paidCount,
          employeeCount: employeeIds.length,
        },
        employeeTotals,
      },
    };
  }

  async getSalaryById(id: string) {
    const salary = await prisma.salary.findUnique({
      where: { id },
      include: this.employeeInclude,
    });
    if (!salary) throw new AppError(404, 'Salary record not found');
    return this.enrichWithCommission(this.serialize(salary));
  }

  async updateSalary(id: string, data: UpdateSalaryInput) {
    const existing = await prisma.salary.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Salary record not found');

    const updateData: Prisma.SalaryUpdateInput = {};

    if (data.amount !== undefined) {
      if (!Number.isFinite(data.amount) || data.amount <= 0) {
        throw new AppError(400, 'Amount must be greater than 0');
      }
      updateData.amount = data.amount;
    }
    if (data.loan_amount !== undefined) {
      if (!Number.isFinite(data.loan_amount) || data.loan_amount < 0) {
        throw new AppError(400, 'Loan amount cannot be negative');
      }
      updateData.loan_amount = data.loan_amount;
    }
    if (data.month !== undefined) updateData.month = data.month;
    if (data.year !== undefined) updateData.year = data.year;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.employee_id !== undefined) {
      updateData.employee = { connect: { id: data.employee_id } };
    }

    if (data.is_paid !== undefined) {
      updateData.is_paid = data.is_paid;
      if (data.is_paid) {
        updateData.paid_date = data.paid_date
          ? new Date(data.paid_date)
          : existing.paid_date || new Date();
        updateData.paid_amount = salaryNet({
          ...existing,
          amount: data.amount ?? existing.amount,
          loan_amount: data.loan_amount ?? existing.loan_amount,
        });
      } else {
        updateData.paid_date = null;
        updateData.paid_amount = 0;
      }
    } else if (data.paid_date !== undefined) {
      updateData.paid_date = data.paid_date ? new Date(data.paid_date) : null;
    }

    const nextEmployeeId = data.employee_id || existing.employee_id;
    const nextMonth = data.month ?? existing.month;
    const nextYear = data.year ?? existing.year;
    if (
      nextEmployeeId !== existing.employee_id ||
      nextMonth !== existing.month ||
      nextYear !== existing.year
    ) {
      const clash = await prisma.salary.findFirst({
        where: {
          employee_id: nextEmployeeId,
          month: nextMonth,
          year: nextYear,
          NOT: { id },
        },
      });
      if (clash) {
        throw new AppError(
          400,
          `A salary record already exists for this employee in ${nextMonth}/${nextYear}`,
        );
      }
    }

    const salary = await prisma.salary.update({
      where: { id },
      data: updateData,
      include: this.employeeInclude,
    });

    return this.serialize(salary);
  }

  async markPaid(id: string, paid_date?: string) {
    return this.updateSalary(id, {
      is_paid: true,
      paid_date: paid_date || new Date().toISOString(),
    });
  }

  async markUnpaid(id: string) {
    return this.updateSalary(id, { is_paid: false, paid_date: null });
  }

  async deleteSalary(id: string) {
    const existing = await prisma.salary.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Salary record not found');
    await prisma.salary.delete({ where: { id } });
    return { message: 'Salary deleted successfully' };
  }

  private employeeInclude = {
    employee: {
      select: {
        id: true,
        name: true,
        employee_code: true,
        phone_number: true,
        email: true,
        monthly_salary: true,
        commission_rate: true,
        bank_name: true,
        account_title: true,
        account_number: true,
        iban: true,
        department: { select: { id: true, name: true } },
        employee_type: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    },
  } as const;

  private async enrichWithCommission(row: any) {
    const commission = await prisma.commission.findUnique({
      where: {
        employee_id_month_year: {
          employee_id: row.employee_id,
          month: row.month,
          year: row.year,
        },
      },
      select: { amount: true, rate: true, is_paid: true },
    });
    row.commission_amount = commission ? asNumber(commission.amount) : 0;
    row.commission_rate = commission
      ? asNumber(commission.rate)
      : asNumber(row.employee?.commission_rate);
    row.commission_is_paid = commission ? !!commission.is_paid : false;
    row.total_with_commission =
      asNumber(row.amount) + asNumber(row.commission_amount);
    return row;
  }

  private serialize(salary: any) {
    const amount = asNumber(salary.amount);
    const loanAmount = asNumber(salary.loan_amount);
    const employee = salary.employee
      ? {
          ...salary.employee,
          monthly_salary: asNumber(salary.employee.monthly_salary),
          commission_rate: asNumber(salary.employee.commission_rate),
        }
      : null;
    return {
      ...salary,
      employee,
      amount,
      loan_amount: loanAmount,
      bonus: asNumber(salary.bonus),
      allowances: asNumber(salary.allowances),
      deductions: asNumber(salary.deductions),
      advance_deduction: asNumber(salary.advance_deduction),
      paid_amount: asNumber(salary.paid_amount),
      net_payable: salary.bonus !== undefined ? salaryNet(salary) : amount - loanAmount,
      commission_amount: 0,
      commission_rate: employee ? asNumber(employee.commission_rate) : 0,
      commission_is_paid: false,
      total_with_commission: amount,
    };
  }
}
