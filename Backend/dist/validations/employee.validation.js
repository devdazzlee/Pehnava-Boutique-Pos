"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateEmployeeTypeSchema = exports.createEmployeeTypeSchema = exports.importEmployeesSchema = exports.listDepartmentsSchema = exports.deleteDepartmentSchema = exports.updateDepartmentSchema = exports.createDepartmentSchema = exports.reactivateEmployeeSchema = exports.deactivateEmployeeSchema = exports.listEmployeeSchema = exports.getEmployeeByIdSchema = exports.deleteEmployeeSchema = exports.updateEmployeeSchema = exports.createEmployeeSchema = void 0;
const zod_1 = require("zod");
const employmentTypeEnum = zod_1.z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']);
const employeeStatusEnum = zod_1.z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED']);
const deactivateStatusEnum = zod_1.z.enum(['INACTIVE', 'TERMINATED']);
const optionalEmail = zod_1.z.string().email().nullable().optional();
const optionalDate = zod_1.z.string().datetime().nullable().optional();
const optionalUuid = zod_1.z.string().uuid().nullable().optional();
const optionalString = zod_1.z.string().nullable().optional();
const employeeBodyFields = {
    name: zod_1.z.string().trim().min(2, 'Full name must be at least 2 characters'),
    email: zod_1.z.string().email().optional().or(zod_1.z.literal('')).transform((v) => (v === '' ? undefined : v)),
    phone_number: zod_1.z.string().optional(),
    cnic: zod_1.z.string().optional(),
    gender: zod_1.z.string().optional(),
    join_date: zod_1.z.string().datetime().optional(),
    employee_type_id: zod_1.z.string().uuid().optional(),
    department_id: zod_1.z.string().uuid().optional(),
    reporting_manager_id: zod_1.z.string().uuid().optional(),
    status: employeeStatusEnum.optional(),
    employment_type: employmentTypeEnum.optional(),
    date_of_birth: zod_1.z.string().datetime().optional(),
    address: zod_1.z.string().optional(),
    personal_email: zod_1.z.string().email().optional().or(zod_1.z.literal('')).transform((v) => (v === '' ? undefined : v)),
    emergency_name: zod_1.z.string().optional(),
    emergency_phone: zod_1.z.string().optional(),
    photo_url: zod_1.z.string().optional(),
    employee_code: zod_1.z.string().optional(),
    user_id: zod_1.z.string().uuid().nullable().optional(),
    commission_rate: zod_1.z.coerce.number().min(0).max(100).optional(),
    monthly_salary: zod_1.z.coerce.number().min(0).optional(),
    bank_name: zod_1.z.string().optional(),
    account_title: zod_1.z.string().optional(),
    account_number: zod_1.z.string().optional(),
    iban: zod_1.z.string().optional(),
};
exports.createEmployeeSchema = zod_1.z.object({
    body: zod_1.z.object(employeeBodyFields),
});
exports.updateEmployeeSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().trim().min(2, 'Full name must be at least 2 characters').optional(),
        email: optionalEmail,
        phone_number: optionalString,
        cnic: optionalString,
        gender: optionalString,
        join_date: zod_1.z.string().datetime().optional(),
        employee_type_id: zod_1.z.string().uuid().optional(),
        department_id: optionalUuid,
        reporting_manager_id: optionalUuid,
        status: employeeStatusEnum.optional(),
        employment_type: employmentTypeEnum.optional(),
        date_of_birth: optionalDate,
        address: optionalString,
        personal_email: optionalEmail,
        emergency_name: optionalString,
        emergency_phone: optionalString,
        photo_url: optionalString,
        employee_code: optionalString,
        is_active: zod_1.z.boolean().optional(),
        user_id: optionalUuid,
        commission_rate: zod_1.z.coerce.number().min(0).max(100).optional(),
        monthly_salary: zod_1.z.coerce.number().min(0).optional(),
        bank_name: optionalString,
        account_title: optionalString,
        account_number: optionalString,
        iban: optionalString,
    }),
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
});
exports.deleteEmployeeSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
});
exports.getEmployeeByIdSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
});
exports.listEmployeeSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.coerce.number().optional(),
        limit: zod_1.z.coerce.number().optional(),
        search: zod_1.z.string().optional(),
        status: employeeStatusEnum.optional(),
        department_id: zod_1.z.string().uuid().optional(),
        employee_type_id: zod_1.z.string().uuid().optional(),
        employment_type: employmentTypeEnum.optional(),
        fetch_all: zod_1.z
            .union([zod_1.z.boolean(), zod_1.z.enum(['true', 'false'])])
            .optional()
            .transform((v) => v === true || v === 'true'),
    }),
});
exports.deactivateEmployeeSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
    body: zod_1.z.object({
        reason: zod_1.z.string().trim().min(1, 'Reason is required'),
        status: deactivateStatusEnum.optional(),
    }),
});
exports.reactivateEmployeeSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
});
exports.createDepartmentSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().trim().min(2, 'Department name must be at least 2 characters'),
        is_active: zod_1.z.boolean().optional(),
    }),
});
exports.updateDepartmentSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
    body: zod_1.z.object({
        name: zod_1.z.string().trim().min(2).optional(),
        is_active: zod_1.z.boolean().optional(),
    }),
});
exports.deleteDepartmentSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
});
exports.listDepartmentsSchema = zod_1.z.object({
    query: zod_1.z.object({
        fetch_all: zod_1.z
            .union([zod_1.z.boolean(), zod_1.z.enum(['true', 'false'])])
            .optional()
            .transform((v) => v === true || v === 'true'),
    }),
});
const importRowSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2),
    email: zod_1.z.string().email().optional().or(zod_1.z.literal('')),
    phone_number: zod_1.z.string().optional(),
    cnic: zod_1.z.string().optional(),
    gender: zod_1.z.string().optional(),
    join_date: zod_1.z.string().optional(),
    employee_type_id: zod_1.z.string().uuid().optional(),
    department_id: zod_1.z.string().uuid().optional(),
    reporting_manager_id: zod_1.z.string().uuid().optional(),
    status: employeeStatusEnum.optional(),
    employment_type: employmentTypeEnum.optional(),
    date_of_birth: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    personal_email: zod_1.z.string().email().optional().or(zod_1.z.literal('')),
    emergency_name: zod_1.z.string().optional(),
    emergency_phone: zod_1.z.string().optional(),
    photo_url: zod_1.z.string().optional(),
    employee_code: zod_1.z.string().optional(),
});
exports.importEmployeesSchema = zod_1.z.object({
    body: zod_1.z.object({
        rows: zod_1.z.array(importRowSchema).min(1, 'At least one row is required'),
    }),
});
exports.createEmployeeTypeSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(2),
        is_active: zod_1.z.boolean().optional(),
    }),
});
exports.updateEmployeeTypeSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(2).optional(),
        is_active: zod_1.z.boolean().optional(),
    }),
});
//# sourceMappingURL=employee.validation.js.map