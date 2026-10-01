import apiClient from "@/lib/apiClient";
import { getList, getOne, post, put, cleanParams, type ListResult } from "./http";

/**
 * Employee directory API — shared by employee-management, Salaries, shifts and
 * Designation screens. Every list fetch reproduces the exact query string the
 * old screens sent so the endpoint contract is unchanged.
 */

export interface Employee {
  id: string;
  employee_code?: string | null;
  name: string;
  email?: string | null;
  phone_number?: string | null;
  status?: string;
  is_active?: boolean;
  employee_type_id?: string;
  department_id?: string | null;
  department?: { id: string; name: string } | null;
  employee_type?: { id: string; name: string } | null;
  [key: string]: unknown;
}

export interface Department {
  id: string;
  name: string;
  is_active?: boolean;
  [key: string]: unknown;
}

/**
 * Every filter the employee-management screen's `fetchEmployees()` produced.
 * Names map 1:1 to the query string the old screen sent.
 */
export interface EmployeeQuery {
  page?: number;
  limit?: number;
  search?: string;
  /** `params.status` — ACTIVE | INACTIVE | ON_LEAVE | TERMINATED */
  status?: string;
  /** `params.department_id` */
  departmentId?: string;
  /** `params.employee_type_id` */
  employeeTypeId?: string;
  /** `params.employment_type` */
  employmentType?: string;
  /** `params.fetch_all` */
  fetchAll?: boolean;
}

function toParams(q: EmployeeQuery): Record<string, unknown> {
  return cleanParams({
    page: q.page ?? 1,
    limit: q.limit ?? 20,
    search: q.search?.trim() || undefined,
    status: q.status,
    department_id: q.departmentId,
    employee_type_id: q.employeeTypeId,
    employment_type: q.employmentType,
    fetch_all: q.fetchAll ? "true" : undefined,
  });
}

/** `GET /employee` — envelope is `{ data: Employee[] | { data: Employee[] }, meta }`. */
export async function fetchEmployees(
  q: EmployeeQuery = {},
  signal?: AbortSignal,
): Promise<ListResult<Employee>> {
  const res = await apiClient.get("/employee", { params: toParams(q), signal });
  const raw = res.data?.data;
  const data: Employee[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)
      ? raw.data
      : [];
  const rawMeta = res.data?.meta ?? {};
  const page = Number(q.page ?? 1) || 1;
  const limit = Number(q.limit ?? 20) || 20;
  return {
    data,
    meta: {
      total: Number(rawMeta.total ?? data.length) || 0,
      page: Number(rawMeta.page ?? page) || page,
      limit: Number(rawMeta.limit ?? limit) || limit,
      totalPages: Math.max(1, Number(rawMeta.totalPages ?? 1) || 1),
    },
  };
}

export function fetchEmployeeById(id: string, signal?: AbortSignal): Promise<Employee> {
  return getOne<Employee>(`/employee/${id}`, { signal });
}

/** `GET /shift-assignment/history/:id` — full shift history for one employee. */
export async function fetchEmployeeShiftHistory(
  id: string,
  signal?: AbortSignal,
): Promise<any[]> {
  const res = await apiClient.get(`/shift-assignment/history/${id}`, { signal });
  const raw = res.data?.data;
  return Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
}

export type EmployeePayload = Record<string, unknown>;

export function createEmployee(body: EmployeePayload) {
  return post<Employee>("/employee", body);
}

export function updateEmployee(id: string, body: EmployeePayload) {
  return put<Employee>(`/employee/${id}`, body);
}

export function deactivateEmployee(
  id: string,
  body: { reason: string; status: string },
) {
  return apiClient.patch(`/employee/${id}/deactivate`, body).then((r) => r.data);
}

export function reactivateEmployee(id: string) {
  return apiClient.patch(`/employee/${id}/reactivate`).then((r) => r.data);
}

/**
 * `POST /employee/import` — the old screen posts one JSON row at a time as
 * `{ rows: [mapped] }` (driven by ExcelUploadDialog's per-row callback), NOT a
 * multipart file upload. Preserved exactly.
 */
export function importEmployees(body: { rows: Record<string, unknown>[] }) {
  return post<unknown>("/employee/import", body);
}

/** `GET /employee/departments` */
export async function fetchDepartments(signal?: AbortSignal): Promise<Department[]> {
  const res = await apiClient.get("/employee/departments", {
    params: { page: 1, limit: 100 },
    signal,
  });
  const raw = res.data?.data;
  return Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
}

export function createDepartment(body: { name: string }) {
  return post<Department>("/employee/departments", body);
}

/**
 * `PATCH /shift-assignment/end/:employeeId` — the employee-detail "end current
 * shift" action ends by employee id, a different endpoint from the shifts
 * screen's `PATCH /shift-assignment/:id/end`. Preserved exactly.
 */
export function endEmployeeCurrentShift(employeeId: string) {
  return apiClient
    .patch(`/shift-assignment/end/${employeeId}`)
    .then((r) => r.data);
}
