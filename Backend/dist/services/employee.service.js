"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeeService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const ACTIVE_STATUSES = [client_1.EmployeeStatus.ACTIVE, client_1.EmployeeStatus.ON_LEAVE];
function isActiveFromStatus(status) {
    return ACTIVE_STATUSES.includes(status);
}
function parseOptionalDate(value) {
    if (value === undefined)
        return undefined;
    if (value === null || value === '')
        return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new apiError_1.AppError(400, `Invalid date: ${value}`);
    }
    return date;
}
class EmployeeService {
    async generateEmployeeCode() {
        for (let attempt = 0; attempt < 20; attempt++) {
            const suffix = Math.floor(100000 + Math.random() * 900000).toString();
            const code = `EMP-${suffix}`;
            const existing = await client_2.prisma.employee.findUnique({
                where: { employee_code: code },
                select: { id: true },
            });
            if (!existing)
                return code;
        }
        throw new apiError_1.AppError(500, 'Failed to generate unique employee code');
    }
    async resolveEmployeeTypeId(employeeTypeId) {
        if (employeeTypeId) {
            const type = await client_2.prisma.employeeType.findUnique({ where: { id: employeeTypeId } });
            if (!type)
                throw new apiError_1.AppError(400, 'Employee type not found');
            return type.id;
        }
        const existing = await client_2.prisma.employeeType.findFirst({
            where: { is_active: true },
            orderBy: { name: 'asc' },
        });
        if (existing)
            return existing.id;
        const created = await client_2.prisma.employeeType.create({
            data: { name: 'General' },
        });
        return created.id;
    }
    employeeListInclude() {
        return {
            employee_type: { select: { id: true, name: true, is_active: true } },
            department: { select: { id: true, name: true, is_active: true } },
            reporting_manager: { select: { id: true, name: true, employee_code: true } },
            user: { select: { id: true, email: true, role: true } },
        };
    }
    async listPosUsers() {
        const users = await client_2.prisma.user.findMany({
            select: {
                id: true,
                email: true,
                role: true,
                branch: { select: { id: true, name: true, code: true } },
                employee: { select: { id: true, name: true, employee_code: true } },
            },
            orderBy: { email: 'asc' },
        });
        return users;
    }
    async createEmployee(data, branch_id) {
        const joinDate = data.join_date ? new Date(data.join_date) : new Date();
        if (Number.isNaN(joinDate.getTime())) {
            throw new apiError_1.AppError(400, 'Invalid join_date');
        }
        const employee_type_id = await this.resolveEmployeeTypeId(data.employee_type_id);
        const status = data.status ?? client_1.EmployeeStatus.ACTIVE;
        const employee_code = data.employee_code?.trim() || (await this.generateEmployeeCode());
        if (data.department_id) {
            const dept = await client_2.prisma.department.findUnique({ where: { id: data.department_id } });
            if (!dept)
                throw new apiError_1.AppError(400, 'Department not found');
        }
        if (data.reporting_manager_id) {
            const manager = await client_2.prisma.employee.findUnique({ where: { id: data.reporting_manager_id } });
            if (!manager)
                throw new apiError_1.AppError(400, 'Reporting manager not found');
        }
        try {
            return await client_2.prisma.employee.create({
                data: {
                    name: data.name.trim(),
                    employee_code,
                    email: data.email || null,
                    phone_number: data.phone_number,
                    cnic: data.cnic,
                    gender: data.gender,
                    join_date: joinDate,
                    status,
                    is_active: isActiveFromStatus(status),
                    employment_type: data.employment_type ?? client_1.EmploymentType.FULL_TIME,
                    date_of_birth: parseOptionalDate(data.date_of_birth) ?? undefined,
                    address: data.address,
                    personal_email: data.personal_email || null,
                    emergency_name: data.emergency_name,
                    emergency_phone: data.emergency_phone,
                    photo_url: data.photo_url,
                    department_id: data.department_id,
                    reporting_manager_id: data.reporting_manager_id,
                    employee_type_id,
                    branch_id,
                    user_id: data.user_id || null,
                    commission_rate: data.commission_rate ?? 0,
                    commission_type: data.commission_type ?? 'PERCENTAGE',
                    commission_fixed: data.commission_fixed ?? 0,
                    monthly_salary: data.monthly_salary ?? 0,
                    bank_name: data.bank_name || null,
                    account_title: data.account_title || null,
                    account_number: data.account_number || null,
                    iban: data.iban || null,
                },
                include: this.employeeListInclude(),
            });
        }
        catch (err) {
            if (err?.code === 'P2002') {
                const target = err?.meta?.target;
                throw new apiError_1.AppError(409, `Duplicate value for unique field: ${Array.isArray(target) ? target.join(', ') : 'unknown'}`);
            }
            throw err;
        }
    }
    async listEmployees({ branch_id, page = 1, limit = 10, search, status, department_id, employee_type_id, employment_type, fetch_all, }) {
        const where = {};
        if (branch_id)
            where.branch_id = branch_id;
        if (status)
            where.status = status;
        if (department_id)
            where.department_id = department_id;
        if (employee_type_id)
            where.employee_type_id = employee_type_id;
        if (employment_type)
            where.employment_type = employment_type;
        if (search?.trim()) {
            const q = search.trim();
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone_number: { contains: q, mode: 'insensitive' } },
                { cnic: { contains: q, mode: 'insensitive' } },
                { employee_code: { contains: q, mode: 'insensitive' } },
            ];
        }
        const take = fetch_all ? Math.min(100, Math.max(limit, 1)) : limit;
        const skip = fetch_all ? 0 : (page - 1) * limit;
        const [employees, total] = await Promise.all([
            client_2.prisma.employee.findMany({
                where,
                skip,
                take,
                orderBy: { created_at: 'desc' },
                include: this.employeeListInclude(),
            }),
            client_2.prisma.employee.count({ where }),
        ]);
        return {
            data: employees,
            meta: {
                total,
                page: fetch_all ? 1 : page,
                limit: take,
                totalPages: fetch_all ? 1 : Math.ceil(total / limit) || 1,
            },
        };
    }
    async getEmployeeById(id) {
        const employee = await client_2.prisma.employee.findUnique({
            where: { id },
            include: {
                ...this.employeeListInclude(),
                branch: { select: { id: true, name: true, code: true } },
                direct_reports: { select: { id: true, name: true, employee_code: true, status: true } },
                _count: {
                    select: {
                        salaries: true,
                        shift_assignments: true,
                    },
                },
                salaries: {
                    orderBy: [{ year: 'desc' }, { month: 'desc' }],
                    take: 6,
                },
                shift_assignments: {
                    orderBy: { start_date: 'desc' },
                    take: 6,
                },
            },
        });
        if (!employee) {
            throw new apiError_1.AppError(404, 'Employee not found');
        }
        return {
            ...employee,
            salary_count: employee._count.salaries,
            shift_count: employee._count.shift_assignments,
        };
    }
    async updateEmployee(id, data) {
        const existing = await client_2.prisma.employee.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Employee not found');
        if (data.employee_type_id) {
            await this.resolveEmployeeTypeId(data.employee_type_id);
        }
        if (data.department_id) {
            const dept = await client_2.prisma.department.findUnique({ where: { id: data.department_id } });
            if (!dept)
                throw new apiError_1.AppError(400, 'Department not found');
        }
        if (data.reporting_manager_id) {
            if (data.reporting_manager_id === id) {
                throw new apiError_1.AppError(400, 'Employee cannot report to themselves');
            }
            const manager = await client_2.prisma.employee.findUnique({ where: { id: data.reporting_manager_id } });
            if (!manager)
                throw new apiError_1.AppError(400, 'Reporting manager not found');
        }
        const updateData = {};
        if (data.name !== undefined)
            updateData.name = data.name.trim();
        if (data.email !== undefined)
            updateData.email = data.email;
        if (data.phone_number !== undefined)
            updateData.phone_number = data.phone_number;
        if (data.cnic !== undefined)
            updateData.cnic = data.cnic;
        if (data.gender !== undefined)
            updateData.gender = data.gender;
        if (data.employee_type_id !== undefined) {
            updateData.employee_type = { connect: { id: data.employee_type_id } };
        }
        if (data.department_id !== undefined) {
            updateData.department = data.department_id
                ? { connect: { id: data.department_id } }
                : { disconnect: true };
        }
        if (data.reporting_manager_id !== undefined) {
            updateData.reporting_manager = data.reporting_manager_id
                ? { connect: { id: data.reporting_manager_id } }
                : { disconnect: true };
        }
        if (data.employment_type !== undefined)
            updateData.employment_type = data.employment_type;
        if (data.address !== undefined)
            updateData.address = data.address;
        if (data.personal_email !== undefined)
            updateData.personal_email = data.personal_email;
        if (data.emergency_name !== undefined)
            updateData.emergency_name = data.emergency_name;
        if (data.emergency_phone !== undefined)
            updateData.emergency_phone = data.emergency_phone;
        if (data.photo_url !== undefined)
            updateData.photo_url = data.photo_url;
        if (data.employee_code !== undefined)
            updateData.employee_code = data.employee_code;
        if (data.commission_rate !== undefined)
            updateData.commission_rate = data.commission_rate;
        if (data.commission_type !== undefined)
            updateData.commission_type = data.commission_type;
        if (data.commission_fixed !== undefined)
            updateData.commission_fixed = data.commission_fixed;
        if (data.monthly_salary !== undefined)
            updateData.monthly_salary = data.monthly_salary;
        if (data.bank_name !== undefined)
            updateData.bank_name = data.bank_name;
        if (data.account_title !== undefined)
            updateData.account_title = data.account_title;
        if (data.account_number !== undefined)
            updateData.account_number = data.account_number;
        if (data.iban !== undefined)
            updateData.iban = data.iban;
        if (data.user_id !== undefined) {
            if (data.user_id) {
                const user = await client_2.prisma.user.findUnique({ where: { id: data.user_id } });
                if (!user)
                    throw new apiError_1.AppError(400, 'POS user not found');
                const taken = await client_2.prisma.employee.findFirst({
                    where: { user_id: data.user_id, NOT: { id } },
                    select: { id: true, name: true },
                });
                if (taken) {
                    throw new apiError_1.AppError(400, `This POS user is already linked to ${taken.name}`);
                }
                updateData.user = { connect: { id: data.user_id } };
            }
            else {
                updateData.user = { disconnect: true };
            }
        }
        if (data.join_date !== undefined) {
            const joinDate = new Date(data.join_date);
            if (Number.isNaN(joinDate.getTime()))
                throw new apiError_1.AppError(400, 'Invalid join_date');
            updateData.join_date = joinDate;
        }
        if (data.date_of_birth !== undefined) {
            updateData.date_of_birth = parseOptionalDate(data.date_of_birth);
        }
        if (data.status !== undefined) {
            updateData.status = data.status;
            updateData.is_active = isActiveFromStatus(data.status);
            if (data.status === client_1.EmployeeStatus.ACTIVE || data.status === client_1.EmployeeStatus.ON_LEAVE) {
                updateData.deactivated_at = null;
                updateData.deactivated_reason = null;
            }
        }
        else if (data.is_active !== undefined) {
            updateData.is_active = data.is_active;
            updateData.status = data.is_active ? client_1.EmployeeStatus.ACTIVE : client_1.EmployeeStatus.INACTIVE;
        }
        try {
            return await client_2.prisma.employee.update({
                where: { id },
                data: updateData,
                include: this.employeeListInclude(),
            });
        }
        catch (err) {
            if (err?.code === 'P2002') {
                const target = err?.meta?.target;
                throw new apiError_1.AppError(409, `Duplicate value for unique field: ${Array.isArray(target) ? target.join(', ') : 'unknown'}`);
            }
            throw err;
        }
    }
    async deactivateEmployee(id, { reason, status = client_1.EmployeeStatus.INACTIVE }) {
        const employee = await client_2.prisma.employee.findUnique({ where: { id } });
        if (!employee)
            throw new apiError_1.AppError(404, 'Employee not found');
        const nextStatus = status ?? client_1.EmployeeStatus.INACTIVE;
        if (nextStatus !== client_1.EmployeeStatus.INACTIVE && nextStatus !== client_1.EmployeeStatus.TERMINATED) {
            throw new apiError_1.AppError(400, 'Deactivate status must be INACTIVE or TERMINATED');
        }
        return client_2.prisma.employee.update({
            where: { id },
            data: {
                status: nextStatus,
                is_active: false,
                deactivated_at: new Date(),
                deactivated_reason: reason.trim(),
            },
            include: this.employeeListInclude(),
        });
    }
    async reactivateEmployee(id) {
        const employee = await client_2.prisma.employee.findUnique({ where: { id } });
        if (!employee)
            throw new apiError_1.AppError(404, 'Employee not found');
        return client_2.prisma.employee.update({
            where: { id },
            data: {
                status: client_1.EmployeeStatus.ACTIVE,
                is_active: true,
                deactivated_at: null,
                deactivated_reason: null,
            },
            include: this.employeeListInclude(),
        });
    }
    async deleteEmployee(id) {
        const employee = await client_2.prisma.employee.findUnique({ where: { id } });
        if (!employee) {
            throw new apiError_1.AppError(404, 'Employee not found');
        }
        const reports = await client_2.prisma.employee.count({ where: { reporting_manager_id: id } });
        if (reports > 0) {
            throw new apiError_1.AppError(400, 'Cannot delete employee who is a reporting manager. Reassign direct reports first.');
        }
        await client_2.prisma.$transaction(async (tx) => {
            await tx.commission.deleteMany({ where: { employee_id: id } });
            await tx.salary.deleteMany({ where: { employee_id: id } });
            await tx.shiftAssignment.deleteMany({ where: { employee_id: id } });
            await tx.employee.delete({ where: { id } });
        }, {
            maxWait: 30000,
            timeout: 120000,
        });
        return employee;
    }
    async createDepartment(data) {
        try {
            return await client_2.prisma.department.create({
                data: {
                    name: data.name.trim(),
                    is_active: data.is_active ?? true,
                },
            });
        }
        catch (err) {
            if (err?.code === 'P2002') {
                throw new apiError_1.AppError(409, 'Department name already exists');
            }
            throw err;
        }
    }
    async listDepartments(fetch_all = false) {
        const departments = await client_2.prisma.department.findMany({
            orderBy: { name: 'asc' },
            take: fetch_all ? 100 : 20,
            include: {
                _count: { select: { employees: true } },
            },
        });
        return departments.map((d) => ({
            ...d,
            employee_count: d._count.employees,
            _count: undefined,
        }));
    }
    async updateDepartment(id, data) {
        const existing = await client_2.prisma.department.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Department not found');
        try {
            return await client_2.prisma.department.update({
                where: { id },
                data: {
                    ...(data.name !== undefined ? { name: data.name.trim() } : {}),
                    ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
                },
            });
        }
        catch (err) {
            if (err?.code === 'P2002') {
                throw new apiError_1.AppError(409, 'Department name already exists');
            }
            throw err;
        }
    }
    async deleteDepartment(id) {
        const existing = await client_2.prisma.department.findUnique({
            where: { id },
            include: { _count: { select: { employees: true } } },
        });
        if (!existing)
            throw new apiError_1.AppError(404, 'Department not found');
        if (existing._count.employees > 0) {
            throw new apiError_1.AppError(400, 'Cannot delete department with assigned employees');
        }
        await client_2.prisma.department.delete({ where: { id } });
        return { message: 'Department deleted successfully' };
    }
    async importEmployees(rows, branch_id) {
        const created = [];
        const errors = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                const join_date = row.join_date && !Number.isNaN(new Date(row.join_date).getTime())
                    ? new Date(row.join_date).toISOString()
                    : undefined;
                const date_of_birth = row.date_of_birth && !Number.isNaN(new Date(row.date_of_birth).getTime())
                    ? new Date(row.date_of_birth).toISOString()
                    : undefined;
                const employee = await this.createEmployee({
                    name: row.name,
                    email: row.email || undefined,
                    phone_number: row.phone_number,
                    cnic: row.cnic,
                    gender: row.gender,
                    join_date,
                    employee_type_id: row.employee_type_id,
                    department_id: row.department_id,
                    reporting_manager_id: row.reporting_manager_id,
                    status: row.status,
                    employment_type: row.employment_type,
                    date_of_birth,
                    address: row.address,
                    personal_email: row.personal_email || undefined,
                    emergency_name: row.emergency_name,
                    emergency_phone: row.emergency_phone,
                    photo_url: row.photo_url,
                    employee_code: row.employee_code,
                }, branch_id);
                created.push(employee);
            }
            catch (err) {
                errors.push({
                    index: i,
                    name: row.name,
                    error: err?.message || 'Failed to import row',
                });
            }
        }
        return { created, errors, created_count: created.length, error_count: errors.length };
    }
}
exports.EmployeeService = EmployeeService;
//# sourceMappingURL=employee.service.js.map