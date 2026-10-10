import { CommissionType, Prisma, SaleStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { asNumber } from '../utils/helpers';
import { businessTodayYmd, localRange, shiftBusinessYmd, toBusinessYmd } from '../utils/timezone';
import {
  GenerateCommissionsInput,
  UpdateCommissionInput,
} from '../validations/commission.validation';
import { recordCashPayOnOpenRegister } from './register-cash-out.helper';

const INCLUDED_STATUSES: SaleStatus[] = ['COMPLETED', 'REFUNDED', 'EXCHANGED'];

const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const employeeSelect = {
  id: true,
  name: true,
  employee_code: true,
  commission_rate: true,
  commission_type: true,
  commission_fixed: true,
  user_id: true,
  phone_number: true,
  department: { select: { id: true, name: true } },
  employee_type: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true, code: true } },
  user: { select: { id: true, email: true } },
} as const;

export class CommissionService {
  async list(params: {
    branch_id?: string;
    page?: number;
    limit?: number;
    employee_id?: string;
    month?: number;
    year?: number;
    is_paid?: boolean;
    search?: string;
    fetch_all?: boolean;
  }) {
    const page = params.page || 1;
    const limit = params.fetch_all ? 500 : params.limit || 20;
    const skip = params.fetch_all ? 0 : (page - 1) * limit;

    const where: Prisma.CommissionWhereInput = {};
    if (params.employee_id) where.employee_id = params.employee_id;
    if (params.month) where.month = params.month;
    if (params.year) where.year = params.year;
    if (params.is_paid !== undefined) where.is_paid = params.is_paid;

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

    const [rows, total, paidCount, partialCount, totalSum, paidAmountSum, piecesSum, salesSum] =
      await Promise.all([
        prisma.commission.findMany({
          where,
          include: { employee: { select: employeeSelect } },
          skip,
          take: limit,
          orderBy: [{ year: 'desc' }, { month: 'desc' }, { created_at: 'desc' }],
        }),
        prisma.commission.count({ where }),
        prisma.commission.count({ where: { ...where, is_paid: true } }),
        prisma.commission.count({
          where: { ...where, is_paid: false, paid_amount: { gt: 0 } },
        }),
        prisma.commission.aggregate({ where, _sum: { amount: true, paid_amount: true } }),
        prisma.commission.aggregate({ where, _sum: { paid_amount: true } }),
        prisma.commission.aggregate({ where, _sum: { pieces: true } }),
        prisma.commission.aggregate({ where, _sum: { sales_amount: true } }),
      ]);

    const data = rows.map((row) => this.serialize(row));
    const totalCommission = asNumber(totalSum._sum.amount);
    const paidAmount = asNumber(paidAmountSum._sum.paid_amount);
    const outstanding = round2(Math.max(0, totalCommission - paidAmount));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        summary: {
          totalCommission,
          paidAmount,
          unpaidAmount: outstanding,
          outstanding,
          paidCount,
          unpaidCount: total - paidCount,
          partialCount,
          totalPieces: asNumber(piecesSum._sum.pieces),
          totalSales: asNumber(salesSum._sum.sales_amount),
          employeeCount: new Set(data.map((r) => r.employee_id)).size,
        },
      },
    };
  }

  /** Live sales → commission preview for a date range (does not save). */
  async preview(params: {
    from: string;
    to: string;
    employee_id?: string;
    branch_id?: string;
    userBranchId?: string | null;
    userRole?: string;
  }) {
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

  async generate(data: GenerateCommissionsInput, opts?: { branch_id?: string }) {
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
      throw new AppError(
        400,
        'No sales found for any employee in this period. Pick a salesperson on each sale in New Sale, or link a POS user on the employee profile.',
      );
    }

    const results = [];
    for (const row of aggregates) {
      const existing = await prisma.commission.findUnique({
        where: {
          employee_id_month_year: {
            employee_id: row.employeeId,
            month,
            year,
          },
        },
      });

      // Paid records are final; unpaid ones are recalculated only when asked.
      if (existing && (existing.is_paid || !data.overwrite)) {
        results.push({ ...this.serialize({ ...existing, employee: row.employeeRaw }), skipped: existing.is_paid ? 'PAID' : 'EXISTS' });
        continue;
      }
      const adjustment = existing ? asNumber(existing.adjustment) : 0;

      const saved = await prisma.commission.upsert({
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
          commission_type: row.commissionType,
          fixed_amount: row.fixedAmount,
          base_amount: row.commissionAmount,
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
          commission_type: row.commissionType,
          fixed_amount: row.fixedAmount,
          base_amount: row.commissionAmount,
          amount: round2(Math.max(0, row.commissionAmount + adjustment)),
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
      created: results.filter((r) => !('skipped' in r)).length,
      skippedPaid: results.filter((r) => 'skipped' in r && r.skipped === 'PAID').length,
      skippedExisting: results.filter((r) => 'skipped' in r && r.skipped === 'EXISTS').length,
      data: results,
    };
  }

  async getById(id: string) {
    const row = await prisma.commission.findUnique({
      where: { id },
      include: { employee: { select: employeeSelect } },
    });
    if (!row) throw new AppError(404, 'Commission record not found');
    return this.serialize(row);
  }

  async update(id: string, data: UpdateCommissionInput) {
    const existing = await prisma.commission.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Commission record not found');

    const updateData: Prisma.CommissionUpdateInput = {};
    let base = asNumber(existing.base_amount);
    let adjustment = asNumber(existing.adjustment);
    let recompute = false;
    if (data.rate !== undefined) {
      updateData.rate = data.rate;
      if (existing.commission_type === 'PERCENTAGE') {
        base = round2(asNumber(existing.sales_amount) * (data.rate / 100));
        updateData.base_amount = base;
        recompute = true;
      }
    }
    if (data.adjustment !== undefined) {
      adjustment = round2(data.adjustment);
      updateData.adjustment = adjustment;
      recompute = true;
    }
    if (data.adjustment_note !== undefined) updateData.adjustment_note = data.adjustment_note || null;
    if (recompute) updateData.amount = round2(Math.max(0, base + adjustment));
    // A typed final amount wins: the difference is kept as the adjustment.
    if (data.amount !== undefined) {
      updateData.amount = round2(data.amount);
      updateData.adjustment = round2(data.amount - base);
    }
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.payment_method !== undefined) updateData.payment_method = data.payment_method || null;
    if (data.payment_reference !== undefined) updateData.payment_reference = data.payment_reference || null;
    const parseDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(localRange(v, v).start.getTime() + 12 * 3600_000) : new Date(v));
    const nextAmount =
      data.amount !== undefined
        ? round2(data.amount)
        : recompute
          ? round2(Math.max(0, base + adjustment))
          : asNumber(existing.amount);
    if (data.is_paid !== undefined) {
      updateData.is_paid = data.is_paid;
      if (data.is_paid) {
        updateData.paid_amount = nextAmount;
        updateData.paid_date = data.paid_date ? parseDate(data.paid_date) : existing.paid_date || new Date();
      } else {
        updateData.paid_amount = 0;
        updateData.paid_date = null;
        updateData.payment_method = null;
        updateData.payment_reference = null;
        updateData.paid_by = null;
      }
    } else if (data.paid_date !== undefined) {
      updateData.paid_date = data.paid_date ? parseDate(data.paid_date) : null;
    }

    // If amount changes, clamp paid_amount and refresh is_paid
    if (data.amount !== undefined || recompute) {
      const alreadyPaid = asNumber(existing.paid_amount);
      const clamped = Math.min(alreadyPaid, nextAmount);
      if (data.is_paid === undefined) {
        updateData.paid_amount = clamped;
        updateData.is_paid = clamped >= nextAmount - 0.005 && clamped > 0;
        if (!updateData.is_paid && clamped <= 0.005) updateData.paid_date = null;
      }
    }

    const row = await prisma.commission.update({
      where: { id },
      data: updateData,
      include: { employee: { select: employeeSelect } },
    });
    return this.serialize(row);
  }

  /** Record a full or partial commission payment (like salary pay). */
  async pay(
    id: string,
    opts: {
      amount: number;
      paid_date?: string;
      payment_method?: string;
      payment_reference?: string | null;
      userId?: string;
    },
  ) {
    const existing = await prisma.commission.findUnique({
      where: { id },
      include: { employee: { select: employeeSelect } },
    });
    if (!existing) throw new AppError(404, 'Commission record not found');

    const total = asNumber(existing.amount);
    const alreadyPaid = asNumber(existing.paid_amount);
    const remaining = round2(Math.max(0, total - alreadyPaid));
    if (remaining <= 0.005) throw new AppError(400, 'This commission is already fully paid');

    const amount = round2(opts.amount);
    if (!(amount > 0)) throw new AppError(400, 'Payment must be greater than 0');
    if (amount > remaining + 0.005) {
      throw new AppError(400, `Only Rs ${remaining.toLocaleString()} is left to pay on this commission`);
    }

    const paid = round2(alreadyPaid + amount);
    const full = paid >= total - 0.005;
    const parseDate = (v: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(localRange(v, v).start.getTime() + 12 * 3600_000) : new Date(v);

    const method = String(opts.payment_method || existing.payment_method || 'CASH').toUpperCase();
    const row = await prisma.commission.update({
      where: { id },
      data: {
        paid_amount: paid,
        is_paid: full,
        paid_date: opts.paid_date ? parseDate(opts.paid_date) : new Date(),
        payment_method: method,
        payment_reference:
          opts.payment_reference !== undefined ? opts.payment_reference : existing.payment_reference,
        ...(opts.userId ? { paid_by: opts.userId } : {}),
      },
      include: { employee: { select: employeeSelect } },
    });
    if (method === 'CASH') {
      const empName = row.employee?.name || 'Staff';
      await recordCashPayOnOpenRegister({
        particular: `Commission · ${empName}`,
        amount,
        userId: opts.userId,
        reference: row.id,
        notes: `Commission ${row.month}/${row.year}`,
      }).catch(() => undefined);
    }
    return this.serialize(row);
  }

  async markPaid(id: string, opts: { paid_date?: string; payment_method?: string; payment_reference?: string | null; userId?: string } = {}) {
    const existing = await prisma.commission.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Commission record not found');
    const remaining = round2(Math.max(0, asNumber(existing.amount) - asNumber(existing.paid_amount)));
    if (remaining <= 0.005) throw new AppError(400, 'Already paid');
    return this.pay(id, {
      amount: remaining,
      paid_date: opts.paid_date,
      payment_method: opts.payment_method || 'CASH',
      payment_reference: opts.payment_reference ?? null,
      userId: opts.userId,
    });
  }

  async bulkPay(ids: string[], opts: { paid_date?: string; payment_method?: string; payment_reference?: string | null; userId?: string }) {
    const rows = await prisma.commission.findMany({
      where: { id: { in: ids }, is_paid: false },
      select: { id: true, amount: true, paid_amount: true },
    });
    let amount = 0;
    for (const r of rows) {
      const due = round2(Math.max(0, asNumber(r.amount) - asNumber(r.paid_amount)));
      if (due <= 0.005) continue;
      await this.pay(r.id, { ...opts, amount: due });
      amount += due;
    }
    return { paid: rows.length, amount: round2(amount), skipped: ids.length - rows.length };
  }

  /**
   * Live commission earned in any date range (today, yesterday, custom…),
   * straight from the bills — nothing is saved. Also shows bills nobody
   * gets credit for, and the previous period of the same length.
   */
  async earned(params: { from: string; to: string; employee_id?: string; branch_id?: string; userBranchId?: string | null; userRole?: string }) {
    const isAdmin = params.userRole === 'SUPER_ADMIN' || params.userRole === 'ADMIN';
    const branchId = isAdmin ? params.branch_id || undefined : params.userBranchId || undefined;
    const rows = await this.aggregateSales({ from: params.from, to: params.to, employeeId: params.employee_id, branchId });

    // Daily trend + who earned what each day.
    const { sales } = await this.attributedSales({ from: params.from, to: params.to, employeeIds: params.employee_id ? [params.employee_id] : undefined, branchId });
    const basis = new Map(rows.map((r) => [r.employeeId, r]));
    const daily = new Map<string, { date: string; sales: number; bills: number; pieces: number; commission: number }>();
    for (const sale of sales) {
      const day = toBusinessYmd(sale.sale_date);
      const d = daily.get(day) || { date: day, sales: 0, bills: 0, pieces: 0, commission: 0 };
      let amount = 0;
      let pieces = 0;
      for (const it of sale.sale_items) {
        amount += num(it.line_total);
        pieces += num(it.quantity);
      }
      d.sales += amount;
      d.pieces += pieces;
      if (!sale.original_sale_id) d.bills += 1;
      const b = basis.get(sale.employeeId);
      if (b) {
        d.commission +=
          b.commissionType === 'FIXED_PER_SALE' ? (sale.original_sale_id ? 0 : b.fixedAmount) : b.commissionType === 'FIXED_PER_PIECE' ? pieces * b.fixedAmount : (amount * b.rate) / 100;
      }
      daily.set(day, d);
    }

    // Bills in the range that nobody gets commission for.
    const { start, end } = localRange(params.from, params.to);
    const linkedUsers = new Set((await prisma.employee.findMany({ where: { user_id: { not: null } }, select: { user_id: true } })).map((e) => e.user_id as string));
    const orphanBills = params.employee_id
      ? []
      : await prisma.sale.findMany({
          where: {
            sale_date: { gte: start, lte: end },
            status: { in: INCLUDED_STATUSES },
            original_sale_id: null,
            salesperson_id: null,
            ...(branchId ? { branch_id: branchId } : {}),
          },
          select: { total_amount: true, created_by: true, notes: true, user: { select: { email: true } } },
        });
    const orphans = orphanBills.filter((s) => !this.isRegenerated(s.notes) && (!s.created_by || !linkedUsers.has(s.created_by)));
    const orphanByUser = new Map<string, { user: string; bills: number; amount: number }>();
    for (const o of orphans) {
      const key = o.user?.email || 'Unknown';
      const row = orphanByUser.get(key) || { user: key, bills: 0, amount: 0 };
      row.bills += 1;
      row.amount += asNumber(o.total_amount);
      orphanByUser.set(key, row);
    }

    // Same-length period just before, for comparison.
    const days = Math.round((localRange(params.to, params.to).start.getTime() - localRange(params.from, params.from).start.getTime()) / 86_400_000) + 1;
    const prevTo = shiftBusinessYmd(params.from, -1);
    const prevFrom = shiftBusinessYmd(prevTo, -(days - 1));
    const prevRows = await this.aggregateSales({ from: prevFrom, to: prevTo, employeeId: params.employee_id, branchId });
    const prevByEmp = new Map(prevRows.map((r) => [r.employeeId, r.commissionAmount]));

    const total = round2(rows.reduce((s, r) => s + r.commissionAmount, 0));
    const totalSales = round2(rows.reduce((s, r) => s + r.salesAmount, 0));
    return {
      period: { from: params.from, to: params.to, days, isToday: params.from === params.to && params.to === businessTodayYmd() },
      previous: {
        from: prevFrom,
        to: prevTo,
        commission: round2(prevRows.reduce((s, r) => s + r.commissionAmount, 0)),
        sales: round2(prevRows.reduce((s, r) => s + r.salesAmount, 0)),
      },
      summary: {
        commission: total,
        sales: totalSales,
        bills: rows.reduce((s, r) => s + r.bills, 0),
        returns: rows.reduce((s, r) => s + r.returns, 0),
        pieces: round2(rows.reduce((s, r) => s + r.pieces, 0)),
        employees: rows.length,
        effectiveRate: totalSales > 0 ? round2((total / totalSales) * 100) : 0,
      },
      rows: rows.map(({ employeeRaw, ...r }) => ({
        ...r,
        branch: employeeRaw.branch?.name ?? null,
        phone: employeeRaw.phone_number ?? null,
        averageBill: r.bills ? round2(r.salesAmount / r.bills) : 0,
        share: total > 0 ? round2((r.commissionAmount / total) * 100) : 0,
        previous: round2(prevByEmp.get(r.employeeId) ?? 0),
      })),
      daily: [...daily.values()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({ ...d, sales: round2(d.sales), pieces: round2(d.pieces), commission: round2(d.commission) })),
      unattributed: {
        bills: orphans.length,
        amount: round2(orphans.reduce((t, o) => t + asNumber(o.total_amount), 0)),
        byUser: [...orphanByUser.values()].map((u) => ({ ...u, amount: round2(u.amount) })).sort((a, b) => b.amount - a.amount),
      },
    };
  }

  async markUnpaid(id: string) {
    return this.update(id, { is_paid: false, paid_date: null });
  }

  async delete(id: string) {
    const existing = await prisma.commission.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Commission record not found');
    await prisma.commission.delete({ where: { id } });
    return { message: 'Commission deleted successfully' };
  }

  /** Sales that contribute to a saved commission period. */
  async salesForCommission(id: string) {
    const row = await prisma.commission.findUnique({
      where: { id },
      include: { employee: { select: employeeSelect } },
    });
    if (!row) throw new AppError(404, 'Commission record not found');

    const from = `${row.year}-${String(row.month).padStart(2, '0')}-01`;
    const lastDay = new Date(row.year, row.month, 0).getDate();
    const to = `${row.year}-${String(row.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const { sales } = await this.attributedSales({ from, to, employeeIds: [row.employee_id] });
    const mapped = sales.map((sale) => this.mapSale(sale));

    return {
      commission: this.serialize(row),
      period: { from, to },
      sales: mapped,
      summary: {
        bills: mapped.filter((r) => !r.isReturn).length,
        pieces: round2(mapped.reduce((s, r) => s + r.pieces, 0)),
        salesAmount: round2(mapped.reduce((s, r) => s + r.salesAmount, 0)),
      },
    };
  }

  /** Active employees that can be picked as salesperson in New Sale. */
  async salespeople(params: { userRole?: string; userBranchId?: string | null }) {
    const isAdmin = params.userRole === 'SUPER_ADMIN' || params.userRole === 'ADMIN';
    const rows = await prisma.employee.findMany({
      where: {
        is_active: true,
        status: { notIn: ['TERMINATED', 'INACTIVE'] },
        ...(!isAdmin && params.userBranchId ? { OR: [{ branch_id: params.userBranchId }, { branch_id: null }] } : {}),
      },
      select: {
        id: true,
        name: true,
        employee_code: true,
        user_id: true,
        photo_url: true,
        commission_type: true,
        commission_rate: true,
        commission_fixed: true,
        branch: { select: { id: true, name: true } },
        employee_type: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      ...r,
      commission_rate: asNumber(r.commission_rate),
      commission_fixed: asNumber(r.commission_fixed),
      commission_label: this.basisLabel(r.commission_type, asNumber(r.commission_rate), asNumber(r.commission_fixed)),
    }));
  }

  /** Sales performance of one employee for a date range (bills, pieces, returns, commission, trend, products). */
  async performance(params: {
    employeeId: string;
    from: string;
    to: string;
    userRole?: string;
    userBranchId?: string | null;
  }) {
    const employee = await prisma.employee.findUnique({ where: { id: params.employeeId }, select: employeeSelect });
    if (!employee) throw new AppError(404, 'Employee not found');

    const { sales } = await this.attributedSales({ from: params.from, to: params.to, employeeIds: [employee.id] });
    const mapped = sales.map((sale) => this.mapSale(sale));
    const originals = mapped.filter((r) => !r.isReturn);
    const returns = mapped.filter((r) => r.isReturn);
    const salesAmount = round2(mapped.reduce((s, r) => s + r.salesAmount, 0));
    const pieces = round2(mapped.reduce((s, r) => s + r.pieces, 0));
    const grossSales = round2(originals.reduce((s, r) => s + r.salesAmount, 0));
    const returnAmount = round2(Math.abs(returns.reduce((s, r) => s + r.salesAmount, 0)));
    const type = employee.commission_type;
    const rate = asNumber(employee.commission_rate);
    const fixed = asNumber(employee.commission_fixed);
    const commission = this.computeCommission(type, rate, fixed, { salesAmount, pieces, bills: originals.length });

    const byDay = new Map<string, { date: string; sales: number; bills: number; pieces: number }>();
    const products = new Map<string, { product: string; sku: string | null; quantity: number; amount: number }>();
    for (const sale of mapped) {
      const key = sale.day;
      const bucket = byDay.get(key) || { date: key, sales: 0, bills: 0, pieces: 0 };
      bucket.sales += sale.salesAmount;
      bucket.pieces += sale.pieces;
      if (!sale.isReturn) bucket.bills += 1;
      byDay.set(key, bucket);
      for (const item of sale.items) {
        const p = products.get(item.product) || { product: item.product, sku: item.sku, quantity: 0, amount: 0 };
        p.quantity += item.quantity;
        p.amount += item.amount;
        products.set(item.product, p);
      }
    }

    // Saved monthly commission records for context (paid / unpaid).
    const records = await prisma.commission.findMany({
      where: { employee_id: employee.id },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 12,
    });

    return {
      employee: this.serialize({ employee }).employee,
      period: { from: params.from, to: params.to },
      basis: { type, rate, fixed, label: this.basisLabel(type, rate, fixed) },
      summary: {
        bills: originals.length,
        returns: returns.length,
        pieces,
        grossSales,
        returnAmount,
        netSales: salesAmount,
        averageBill: originals.length ? round2(grossSales / originals.length) : 0,
        commission,
      },
      daily: [...byDay.values()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({ ...d, sales: round2(d.sales), pieces: round2(d.pieces) })),
      topProducts: [...products.values()]
        .map((p) => ({ ...p, quantity: round2(p.quantity), amount: round2(p.amount) }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
      sales: mapped.slice(0, 200),
      records: records.map((r) => ({
        id: r.id,
        month: r.month,
        year: r.year,
        sales_amount: asNumber(r.sales_amount),
        amount: asNumber(r.amount),
        is_paid: r.is_paid,
        paid_date: r.paid_date,
      })),
    };
  }

  /* --------------------------- internals --------------------------- */

  private basisLabel(type: CommissionType, rate: number, fixed: number) {
    if (type === 'FIXED_PER_SALE') return `Rs ${fixed.toLocaleString('en-US')} per bill`;
    if (type === 'FIXED_PER_PIECE') return `Rs ${fixed.toLocaleString('en-US')} per piece`;
    return `${rate}% of sales`;
  }

  private computeCommission(
    type: CommissionType,
    rate: number,
    fixed: number,
    stats: { salesAmount: number; pieces: number; bills: number },
  ) {
    if (type === 'FIXED_PER_SALE') return round2(stats.bills * fixed);
    // Net pieces (returns reduce the count)
    if (type === 'FIXED_PER_PIECE') return round2(Math.max(0, stats.pieces) * fixed);
    return round2(stats.salesAmount * (rate / 100));
  }

  /**
   * Sales in the window credited to employees. A sale belongs to its picked
   * salesperson; returns follow the original sale's salesperson; otherwise the
   * cashier's linked employee (POS login) gets the credit.
   */
  private async attributedSales(params: { from: string; to: string; employeeIds?: string[]; branchId?: string }) {
    const { start, end } = localRange(params.from, params.to);
    const employees = await prisma.employee.findMany({
      where: {
        ...(params.employeeIds ? { id: { in: params.employeeIds } } : { is_active: true, status: { not: 'TERMINATED' } }),
        ...(params.branchId ? { branch_id: params.branchId } : {}),
      },
      select: employeeSelect,
    });
    const allLinked = await prisma.employee.findMany({
      where: { user_id: { not: null } },
      select: { id: true, user_id: true },
    });
    const employeeByUser = new Map(allLinked.map((e) => [e.user_id as string, e.id]));
    const wanted = new Set(employees.map((e) => e.id));

    const sales = await prisma.sale.findMany({
      where: {
        sale_date: { gte: start, lte: end },
        status: { in: INCLUDED_STATUSES },
        ...(params.branchId ? { branch_id: params.branchId } : {}),
      },
      select: {
        id: true,
        sale_number: true,
        invoice_number: true,
        sale_date: true,
        status: true,
        notes: true,
        created_by: true,
        salesperson_id: true,
        original_sale_id: true,
        original_sale: { select: { salesperson_id: true, created_by: true } },
        customer: { select: { id: true, name: true } },
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

    type Row = (typeof sales)[number] & { employeeId: string };
    const attributed: Row[] = [];
    for (const sale of sales) {
      if (this.isRegenerated(sale.notes)) continue;
      const employeeId =
        sale.salesperson_id ||
        (sale.original_sale_id
          ? sale.original_sale?.salesperson_id ||
            (sale.original_sale?.created_by ? employeeByUser.get(sale.original_sale.created_by) : undefined)
          : undefined) ||
        (sale.created_by ? employeeByUser.get(sale.created_by) : undefined);
      if (!employeeId || !wanted.has(employeeId)) continue;
      attributed.push({ ...sale, employeeId });
    }
    return { employees, sales: attributed };
  }

  private mapSale(sale: Awaited<ReturnType<CommissionService['attributedSales']>>['sales'][number]) {
    let pieces = 0;
    let salesAmount = 0;
    for (const item of sale.sale_items) {
      pieces += num(item.quantity);
      salesAmount += num(item.line_total);
    }
    return {
      id: sale.id,
      date: sale.sale_date.toISOString(),
      day: toBusinessYmd(sale.sale_date),
      voucher: sale.invoice_number || sale.sale_number,
      status: sale.status,
      isReturn: Boolean(sale.original_sale_id),
      attribution: sale.salesperson_id ? 'SALESPERSON' : sale.original_sale_id ? 'ORIGINAL_SALE' : 'CASHIER',
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
  }

  private async aggregateSales(params: {
    from: string;
    to: string;
    employeeId?: string;
    branchId?: string;
  }) {
    const { employees, sales } = await this.attributedSales({
      from: params.from,
      to: params.to,
      employeeIds: params.employeeId ? [params.employeeId] : undefined,
      branchId: params.branchId,
    });
    if (employees.length === 0) return [];

    const byEmployee = new Map<string, { bills: number; returns: number; pieces: number; salesAmount: number }>();
    for (const sale of sales) {
      const bucket = byEmployee.get(sale.employeeId) || { bills: 0, returns: 0, pieces: 0, salesAmount: 0 };
      if (sale.original_sale_id) bucket.returns += 1;
      else bucket.bills += 1;
      for (const item of sale.sale_items) {
        bucket.pieces += num(item.quantity);
        bucket.salesAmount += num(item.line_total);
      }
      byEmployee.set(sale.employeeId, bucket);
    }

    return employees
      .map((employee) => {
        const stats = byEmployee.get(employee.id) || { bills: 0, returns: 0, pieces: 0, salesAmount: 0 };
        const rate = asNumber(employee.commission_rate);
        const fixed = asNumber(employee.commission_fixed);
        const salesAmount = round2(stats.salesAmount);
        const pieces = round2(stats.pieces);
        const commissionAmount = this.computeCommission(employee.commission_type, rate, fixed, {
          salesAmount,
          pieces,
          bills: stats.bills,
        });
        return {
          employeeId: employee.id,
          employee: employee.name,
          code: employee.employee_code,
          designation: employee.employee_type?.name || null,
          userEmail: employee.user?.email || null,
          rate,
          commissionType: employee.commission_type,
          fixedAmount: fixed,
          basis: this.basisLabel(employee.commission_type, rate, fixed),
          bills: stats.bills,
          returns: stats.returns,
          pieces,
          salesAmount,
          commissionAmount,
          employeeRaw: employee,
        };
      })
      .filter((row) => row.bills > 0 || row.pieces !== 0 || row.salesAmount !== 0)
      .sort((a, b) => b.commissionAmount - a.commissionAmount || a.employee.localeCompare(b.employee));
  }

  private isRegenerated(notes?: string | null) {
    const text = (notes || '').toLowerCase();
    return text.includes('[regenerated]') || text.includes('regenerated bill');
  }

  private serialize(row: any) {
    const amount = asNumber(row.amount);
    const paidAmount = asNumber(row.paid_amount);
    const outstanding = round2(Math.max(0, amount - paidAmount));
    const status =
      paidAmount <= 0.005 ? 'UNPAID' : outstanding <= 0.005 ? 'PAID' : 'PARTIAL';
    return {
      ...row,
      sales_amount: asNumber(row.sales_amount),
      pieces: asNumber(row.pieces),
      rate: asNumber(row.rate),
      fixed_amount: asNumber(row.fixed_amount),
      amount,
      paid_amount: paidAmount,
      outstanding,
      status,
      base_amount: row.base_amount === undefined ? undefined : asNumber(row.base_amount),
      adjustment: row.adjustment === undefined ? undefined : asNumber(row.adjustment),
      employee: row.employee
        ? {
            ...row.employee,
            commission_rate: asNumber(row.employee.commission_rate),
            commission_fixed: asNumber(row.employee.commission_fixed),
          }
        : row.employee,
    };
  }
}
