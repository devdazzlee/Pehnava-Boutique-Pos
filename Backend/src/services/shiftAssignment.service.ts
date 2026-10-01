import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import {
  AssignShiftInput,
  UpdateShiftAssignmentInput,
} from '../validations/shiftAssignment.validation';
import {
  businessTodayYmd,
  shiftBusinessYmd,
  startOfBusinessMonth,
  zonedLocalToUtc,
} from '../utils/timezone';

const employeeSelect = {
  id: true,
  name: true,
  employee_code: true,
  status: true,
  department: { select: { id: true, name: true } },
  employee_type: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeSelect;

function startOfLocalDay(dateStr: string) {
  const ymd = dateStr.split('T')[0];
  return zonedLocalToUtc(ymd, 0, 0, 0, 0);
}

function endOfLocalDay(dateStr: string) {
  const ymd = dateStr.split('T')[0];
  return zonedLocalToUtc(ymd, 23, 59, 59, 999);
}

function todayUtcBounds() {
  const today = businessTodayYmd();
  return {
    start: zonedLocalToUtc(today, 0, 0, 0, 0),
    end: zonedLocalToUtc(today, 23, 59, 59, 999),
  };
}

function weekAgoUtc() {
  return zonedLocalToUtc(shiftBusinessYmd(businessTodayYmd(), -6), 0, 0, 0, 0);
}

function monthStartUtc() {
  return startOfBusinessMonth();
}

function normalizeStartDate(value: string | Date) {
  const iso =
    typeof value === 'string' ? value : value.toISOString();
  return startOfLocalDay(iso);
}

function parseBreakHours(breakTime?: string | null) {
  if (!breakTime) return 0;
  const n = parseFloat(String(breakTime));
  return Number.isFinite(n) ? n : 0;
}

function parseShiftTimes(shiftTime?: string | null) {
  const raw = (shiftTime || '').trim();
  const parts = raw.split('-').map((p) => p.trim());
  return {
    startTime: parts[0] || '',
    endTime: parts[1] || '',
  };
}

function parseTimeToDecimal(timeStr: string) {
  if (!timeStr) return 0;
  const cleanStr = timeStr.replace(/\s+/g, '').toUpperCase();
  const isPM = cleanStr.includes('PM');
  const isAM = cleanStr.includes('AM');
  const numericPart = cleanStr.replace(/[AP]M/, '');
  const [hStr, mStr] = numericPart.split(':');
  let h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  if (isPM && h < 12) h += 12;
  else if (isAM && h === 12) h = 0;
  return h + m / 60;
}

function calculateHours(
  startTime: string,
  endTime: string,
  breakHours: number,
) {
  const startDecimal = parseTimeToDecimal(startTime);
  const endDecimal = parseTimeToDecimal(endTime);
  let diff = endDecimal - startDecimal;
  if (diff < 0) diff += 24;
  return Math.max(0, diff - breakHours);
}

function deriveStatus(
  startDate: Date,
  endDate: Date | null,
  todayStart: Date,
): 'scheduled' | 'active' | 'completed' {
  if (endDate) return 'completed';
  if (startDate <= todayStart) return 'active';
  return 'scheduled';
}

export class ShiftAssignmentService {
  private serialize(row: any, todayStart = todayUtcBounds().start) {
    const { startTime, endTime } = parseShiftTimes(row.shift_time);
    const breakHours = parseBreakHours(row.break_time);
    const totalHours = calculateHours(startTime, endTime, breakHours);
    const status = deriveStatus(
      new Date(row.start_date),
      row.end_date ? new Date(row.end_date) : null,
      todayStart,
    );

    return {
      ...row,
      sales: Number(row.sales) || 0,
      start_time: startTime,
      end_time: endTime,
      break_hours: breakHours,
      total_hours: Number(totalHours.toFixed(2)),
      status,
    };
  }

  async assignShift(data: AssignShiftInput & { break_time?: string | null }) {
    const employee = await prisma.employee.findUnique({
      where: { id: data.employee_id },
      select: { id: true, name: true, status: true },
    });
    if (!employee) throw new AppError(404, 'Employee not found');

    const startDate = normalizeStartDate(data.start_date);

    const existing = await prisma.shiftAssignment.findFirst({
      where: {
        employee_id: data.employee_id,
        start_date: {
          gte: startDate,
          lte: endOfLocalDay(startDate.toISOString()),
        },
      },
    });
    if (existing) {
      throw new AppError(
        400,
        `A shift already exists for ${employee.name} on ${startDate.toISOString().slice(0, 10)}`,
      );
    }

    try {
      const assignment = await prisma.shiftAssignment.create({
        data: {
          employee_id: data.employee_id,
          shift_time: data.shift_time.trim(),
          start_date: startDate,
          end_date: data.end_date ? new Date(data.end_date) : null,
          break_time: data.break_time || '1 hour',
          sales: data.sales ?? 0,
        },
        include: { employee: { select: employeeSelect } },
      });
      return this.serialize(assignment);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new AppError(
          400,
          `A shift already exists for ${employee.name} on that date`,
        );
      }
      throw err;
    }
  }

  async getCurrentShift(employee_id: string) {
    const row = await prisma.shiftAssignment.findFirst({
      where: { employee_id, end_date: null },
      orderBy: { start_date: 'desc' },
      include: { employee: { select: employeeSelect } },
    });
    return row ? this.serialize(row) : null;
  }

  async getShiftHistory(employee_id: string) {
    const todayStart = todayUtcBounds().start;
    const rows = await prisma.shiftAssignment.findMany({
      where: { employee_id },
      orderBy: { start_date: 'desc' },
      include: { employee: { select: employeeSelect } },
    });
    return rows.map((r) => this.serialize(r, todayStart));
  }

  async endCurrentShift(
    employee_id: string,
    end_date = new Date(),
    sales?: number,
  ) {
    const open = await prisma.shiftAssignment.findFirst({
      where: { employee_id, end_date: null },
      orderBy: { start_date: 'desc' },
    });
    if (!open) throw new AppError(404, 'No open shift found for this employee');

    const updated = await prisma.shiftAssignment.update({
      where: { id: open.id },
      data: {
        end_date,
        ...(sales !== undefined ? { sales } : {}),
      },
      include: { employee: { select: employeeSelect } },
    });
    return this.serialize(updated);
  }

  async endShiftById(id: string, sales?: number) {
    const existing = await prisma.shiftAssignment.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Shift assignment not found');
    if (existing.end_date) {
      throw new AppError(400, 'This shift is already completed');
    }

    const updated = await prisma.shiftAssignment.update({
      where: { id },
      data: {
        end_date: new Date(),
        ...(sales !== undefined ? { sales } : {}),
      },
      include: { employee: { select: employeeSelect } },
    });
    return this.serialize(updated);
  }

  async listShifts(params: {
    page?: number;
    limit?: number;
    fetch_all?: boolean;
    search?: string;
    employee_id?: string;
    status?: 'all' | 'active' | 'scheduled' | 'completed';
    date_from?: string;
    date_to?: string;
    period?: 'all' | 'today' | 'week' | 'month';
  }) {
    const page = params.page || 1;
    const fetchAll = !!params.fetch_all;
    const limit = fetchAll ? 100 : params.limit || 20;
    const skip = fetchAll ? 0 : (page - 1) * limit;
    const { start: todayStart, end: todayEnd } = todayUtcBounds();

    const where: Prisma.ShiftAssignmentWhereInput = {};

    if (params.employee_id) where.employee_id = params.employee_id;

    if (params.search?.trim()) {
      const q = params.search.trim();
      where.OR = [
        { employee: { name: { contains: q, mode: 'insensitive' } } },
        { employee: { employee_code: { contains: q, mode: 'insensitive' } } },
        { shift_time: { contains: q, mode: 'insensitive' } },
      ];
    }

    const dateFilter: Prisma.DateTimeFilter = {};
    if (params.period === 'today') {
      dateFilter.gte = todayStart;
      dateFilter.lte = todayEnd;
    } else if (params.period === 'week') {
      dateFilter.gte = weekAgoUtc();
      dateFilter.lte = todayEnd;
    } else if (params.period === 'month') {
      dateFilter.gte = monthStartUtc();
      dateFilter.lte = todayEnd;
    }
    if (params.date_from) {
      dateFilter.gte = startOfLocalDay(params.date_from);
    }
    if (params.date_to) {
      dateFilter.lte = endOfLocalDay(params.date_to);
    }
    if (Object.keys(dateFilter).length) {
      where.start_date = dateFilter;
    }

    if (params.status === 'completed') {
      where.end_date = { not: null };
    } else if (params.status === 'active') {
      where.end_date = null;
      where.start_date = {
        ...(typeof where.start_date === 'object' ? where.start_date : {}),
        lte: todayEnd,
      };
    } else if (params.status === 'scheduled') {
      where.end_date = null;
      where.start_date = {
        ...(typeof where.start_date === 'object' ? where.start_date : {}),
        gt: todayEnd,
      };
    }

    const [rows, total, allForSummary] = await Promise.all([
      prisma.shiftAssignment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ start_date: 'desc' }, { id: 'desc' }],
        include: { employee: { select: employeeSelect } },
      }),
      prisma.shiftAssignment.count({ where }),
      prisma.shiftAssignment.findMany({
        select: {
          start_date: true,
          end_date: true,
          sales: true,
          shift_time: true,
          break_time: true,
        },
      }),
    ]);

    const summary = {
      total: allForSummary.length,
      active: 0,
      scheduled: 0,
      completed: 0,
      today: 0,
      todayHours: 0,
      todaySales: 0,
      totalSales: 0,
    };

    for (const row of allForSummary) {
      const status = deriveStatus(
        row.start_date,
        row.end_date,
        todayStart,
      );
      if (status === 'active') summary.active += 1;
      else if (status === 'scheduled') summary.scheduled += 1;
      else summary.completed += 1;

      summary.totalSales += Number(row.sales) || 0;

      if (row.start_date >= todayStart && row.start_date <= todayEnd) {
        summary.today += 1;
        summary.todaySales += Number(row.sales) || 0;
        const { startTime, endTime } = parseShiftTimes(row.shift_time);
        summary.todayHours += calculateHours(
          startTime,
          endTime,
          parseBreakHours(row.break_time),
        );
      }
    }

    summary.todayHours = Number(summary.todayHours.toFixed(1));
    summary.todaySales = Number(summary.todaySales.toFixed(2));
    summary.totalSales = Number(summary.totalSales.toFixed(2));

    return {
      data: rows.map((r) => this.serialize(r, todayStart)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        fetchAll,
        summary,
      },
    };
  }

  /** @deprecated prefer listShifts */
  async getAllShifts() {
    const result = await this.listShifts({ fetch_all: true });
    return result.data;
  }

  async updateShift(id: string, data: UpdateShiftAssignmentInput) {
    const existing = await prisma.shiftAssignment.findUnique({
      where: { id },
      include: { employee: { select: { id: true, name: true } } },
    });
    if (!existing) throw new AppError(404, 'Shift assignment not found');

    const updateData: Prisma.ShiftAssignmentUpdateInput = {};

    if (data.shift_time !== undefined) {
      updateData.shift_time = data.shift_time.trim();
    }
    if (data.break_time !== undefined) {
      updateData.break_time = data.break_time;
    }
    if (data.sales !== undefined) {
      updateData.sales = data.sales;
    }
    if (data.end_date !== undefined) {
      updateData.end_date = data.end_date ? new Date(data.end_date) : null;
    }
    if (data.start_date !== undefined) {
      const startDate = normalizeStartDate(data.start_date);
      const clash = await prisma.shiftAssignment.findFirst({
        where: {
          employee_id: existing.employee_id,
          id: { not: id },
          start_date: {
            gte: startDate,
            lte: endOfLocalDay(startDate.toISOString()),
          },
        },
      });
      if (clash) {
        throw new AppError(
          400,
          `A shift already exists for ${existing.employee?.name || 'this employee'} on ${startDate.toISOString().slice(0, 10)}`,
        );
      }
      updateData.start_date = startDate;
    }

    try {
      const updated = await prisma.shiftAssignment.update({
        where: { id },
        data: updateData,
        include: { employee: { select: employeeSelect } },
      });
      return this.serialize(updated);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new AppError(400, 'A shift already exists for that employee on that date');
      }
      throw err;
    }
  }

  async deleteShift(id: string) {
    const existing = await prisma.shiftAssignment.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Shift assignment not found');
    await prisma.shiftAssignment.delete({ where: { id } });
    return { message: 'Shift deleted successfully' };
  }
}
