import { z } from 'zod';

const employmentTypeEnum = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']);
const employeeStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED']);
const deactivateStatusEnum = z.enum(['INACTIVE', 'TERMINATED']);

const optionalEmail = z.string().email().nullable().optional();
const optionalDate = z.string().datetime().nullable().optional();
const optionalUuid = z.string().uuid().nullable().optional();
const optionalString = z.string().nullable().optional();

const employeeBodyFields = {
  name: z.string().trim().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email().optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
  phone_number: z.string().optional(),
  cnic: z.string().optional(),
  gender: z.string().optional(),
  join_date: z.string().datetime().optional(),
  employee_type_id: z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  reporting_manager_id: z.string().uuid().optional(),
  status: employeeStatusEnum.optional(),
  employment_type: employmentTypeEnum.optional(),
  date_of_birth: z.string().datetime().optional(),
  address: z.string().optional(),
  personal_email: z.string().email().optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
  emergency_name: z.string().optional(),
  emergency_phone: z.string().optional(),
  photo_url: z.string().optional(),
  employee_code: z.string().optional(),
  user_id: z.string().uuid().nullable().optional(),
  commission_rate: z.coerce.number().min(0).max(100).optional(),
  monthly_salary: z.coerce.number().min(0).optional(),
  bank_name: z.string().optional(),
  account_title: z.string().optional(),
  account_number: z.string().optional(),
  iban: z.string().optional(),
};

export const createEmployeeSchema = z.object({
  body: z.object(employeeBodyFields),
});

export const updateEmployeeSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Full name must be at least 2 characters').optional(),
    email: optionalEmail,
    phone_number: optionalString,
    cnic: optionalString,
    gender: optionalString,
    join_date: z.string().datetime().optional(),
    employee_type_id: z.string().uuid().optional(),
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
    is_active: z.boolean().optional(),
    user_id: optionalUuid,
    commission_rate: z.coerce.number().min(0).max(100).optional(),
    monthly_salary: z.coerce.number().min(0).optional(),
    bank_name: optionalString,
    account_title: optionalString,
    account_number: optionalString,
    iban: optionalString,
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const deleteEmployeeSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const getEmployeeByIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const listEmployeeSchema = z.object({
  query: z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    search: z.string().optional(),
    status: employeeStatusEnum.optional(),
    department_id: z.string().uuid().optional(),
    employee_type_id: z.string().uuid().optional(),
    employment_type: employmentTypeEnum.optional(),
    fetch_all: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .optional()
      .transform((v) => v === true || v === 'true'),
  }),
});

export const deactivateEmployeeSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().trim().min(1, 'Reason is required'),
    status: deactivateStatusEnum.optional(),
  }),
});

export const reactivateEmployeeSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const createDepartmentSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Department name must be at least 2 characters'),
    is_active: z.boolean().optional(),
  }),
});

export const updateDepartmentSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().trim().min(2).optional(),
    is_active: z.boolean().optional(),
  }),
});

export const deleteDepartmentSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const listDepartmentsSchema = z.object({
  query: z.object({
    fetch_all: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .optional()
      .transform((v) => v === true || v === 'true'),
  }),
});

const importRowSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email().optional().or(z.literal('')),
  phone_number: z.string().optional(),
  cnic: z.string().optional(),
  gender: z.string().optional(),
  join_date: z.string().optional(),
  employee_type_id: z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  reporting_manager_id: z.string().uuid().optional(),
  status: employeeStatusEnum.optional(),
  employment_type: employmentTypeEnum.optional(),
  date_of_birth: z.string().optional(),
  address: z.string().optional(),
  personal_email: z.string().email().optional().or(z.literal('')),
  emergency_name: z.string().optional(),
  emergency_phone: z.string().optional(),
  photo_url: z.string().optional(),
  employee_code: z.string().optional(),
});

export const importEmployeesSchema = z.object({
  body: z.object({
    rows: z.array(importRowSchema).min(1, 'At least one row is required'),
  }),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>['body'];
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>['body'];
export type ImportEmployeeRow = z.infer<typeof importRowSchema>;
export type DeactivateEmployeeInput = z.infer<typeof deactivateEmployeeSchema>['body'];
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>['body'];
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>['body'];

export const createEmployeeTypeSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    is_active: z.boolean().optional(),
  }),
});

export const updateEmployeeTypeSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    is_active: z.boolean().optional(),
  }),
});
