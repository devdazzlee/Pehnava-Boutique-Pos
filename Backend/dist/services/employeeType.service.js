"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeeTypeService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
/**
 * Employee types / designations. (Previously these methods lived, misplaced,
 * inside ExpenseService — moved here so the concern has one home.)
 */
class EmployeeTypeService {
    async create(data) {
        const name = data.name.trim();
        if (name.length < 2) {
            throw new apiError_1.AppError(400, 'Name must be at least 2 characters');
        }
        const existing = await client_1.prisma.employeeType.findFirst({
            where: { name: { equals: name, mode: 'insensitive' } },
        });
        if (existing) {
            throw new apiError_1.AppError(400, 'A designation with this name already exists');
        }
        return client_1.prisma.employeeType.create({
            data: { name, is_active: data.is_active ?? true },
        });
    }
    async getAll(opts) {
        const where = {};
        if (opts?.search?.trim()) {
            where.name = { contains: opts.search.trim(), mode: 'insensitive' };
        }
        if (opts?.is_active !== undefined) {
            where.is_active = opts.is_active;
        }
        const types = await client_1.prisma.employeeType.findMany({
            where,
            orderBy: { name: 'asc' },
            include: { _count: { select: { employees: true } } },
        });
        return types.map((t) => ({
            id: t.id,
            name: t.name,
            is_active: t.is_active,
            employee_count: t._count.employees,
        }));
    }
    async getById(id) {
        const type = await client_1.prisma.employeeType.findUnique({
            where: { id },
            include: { _count: { select: { employees: true } } },
        });
        if (!type)
            throw new apiError_1.AppError(404, 'Designation not found');
        return {
            id: type.id,
            name: type.name,
            is_active: type.is_active,
            employee_count: type._count.employees,
        };
    }
    async update(id, data) {
        const existing = await client_1.prisma.employeeType.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Designation not found');
        if (data.name !== undefined) {
            const name = data.name.trim();
            if (name.length < 2) {
                throw new apiError_1.AppError(400, 'Name must be at least 2 characters');
            }
            const clash = await client_1.prisma.employeeType.findFirst({
                where: { name: { equals: name, mode: 'insensitive' }, NOT: { id } },
            });
            if (clash) {
                throw new apiError_1.AppError(400, 'A designation with this name already exists');
            }
            data.name = name;
        }
        const updated = await client_1.prisma.employeeType.update({
            where: { id },
            data,
            include: { _count: { select: { employees: true } } },
        });
        return {
            id: updated.id,
            name: updated.name,
            is_active: updated.is_active,
            employee_count: updated._count.employees,
        };
    }
    async toggleActive(id) {
        const existing = await client_1.prisma.employeeType.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Designation not found');
        return this.update(id, { is_active: !existing.is_active });
    }
    /** Safe delete — blocked while employees still use this designation. */
    async delete(id) {
        const type = await client_1.prisma.employeeType.findUnique({
            where: { id },
            include: { _count: { select: { employees: true } } },
        });
        if (!type) {
            throw new apiError_1.AppError(404, 'Designation not found');
        }
        if (type._count.employees > 0) {
            throw new apiError_1.AppError(400, `Cannot delete "${type.name}" — ${type._count.employees} employee(s) still use it. Reassign or deactivate them first.`);
        }
        await client_1.prisma.employeeType.delete({ where: { id } });
        return { message: 'Designation deleted successfully', id: type.id, name: type.name };
    }
}
exports.EmployeeTypeService = EmployeeTypeService;
//# sourceMappingURL=employeeType.service.js.map