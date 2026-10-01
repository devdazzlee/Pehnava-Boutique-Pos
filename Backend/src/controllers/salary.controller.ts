import { Request, Response } from 'express';
import { SalaryService } from '../services/salary.service';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';

const salaryService = new SalaryService();

export const createSalary = asyncHandler(async (req: Request, res: Response) => {
  const salary = await salaryService.createSalary(req.body);
  new ApiResponse(salary, 'Salary record created successfully', 201).send(res);
});

export const listSalaries = asyncHandler(async (req: Request, res: Response) => {
  const {
    page = 1,
    limit = 20,
    employee_id,
    month,
    year,
    is_paid,
    search,
    fetch_all,
    paid_from,
    paid_to,
  } = req.query;

  const result = await salaryService.listSalaries({
    branch_id: req.user?.branch_id || undefined,
    page: Number(page),
    limit: Number(limit),
    employee_id: employee_id as string | undefined,
    month: month ? Number(month) : undefined,
    year: year ? Number(year) : undefined,
    is_paid:
      is_paid === 'true' ? true : is_paid === 'false' ? false : undefined,
    search: search as string | undefined,
    fetch_all: String(fetch_all) === 'true',
    paid_from: paid_from ? String(paid_from) : undefined,
    paid_to: paid_to ? String(paid_to) : undefined,
  });

  new ApiResponse(
    result.data,
    'Salaries fetched successfully',
    200,
    true,
    result.meta,
  ).send(res);
});

export const getSalaryById = asyncHandler(async (req: Request, res: Response) => {
  const salary = await salaryService.getSalaryById(req.params.id);
  new ApiResponse(salary, 'Salary record fetched successfully').send(res);
});

export const updateSalary = asyncHandler(async (req: Request, res: Response) => {
  const salary = await salaryService.updateSalary(req.params.id, req.body);
  new ApiResponse(salary, 'Salary record updated successfully').send(res);
});

export const markSalaryPaid = asyncHandler(async (req: Request, res: Response) => {
  const salary = await salaryService.markPaid(
    req.params.id,
    req.body?.paid_date,
  );
  new ApiResponse(salary, 'Salary marked as paid').send(res);
});

export const markSalaryUnpaid = asyncHandler(async (req: Request, res: Response) => {
  const salary = await salaryService.markUnpaid(req.params.id);
  new ApiResponse(salary, 'Salary marked as unpaid').send(res);
});

export const deleteSalary = asyncHandler(async (req: Request, res: Response) => {
  await salaryService.deleteSalary(req.params.id);
  new ApiResponse(null, 'Salary record deleted successfully').send(res);
});
