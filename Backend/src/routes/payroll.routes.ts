import { Request, Response, Router } from 'express';
import { z } from 'zod';
import asyncHandler from '../middleware/asyncHandler';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { ApiResponse } from '../utils/apiResponse';
import { EmployeePayrollService } from '../services/employee-payroll.service';

const service = new EmployeePayrollService();
const router = Router();

const money = z.coerce.number().min(0, 'Amount cannot be negative').max(1e10);
const month = z.coerce.number().int().min(1).max(12);
const year = z.coerce.number().int().min(2020).max(2100);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use YYYY-MM-DD');
const id = z.object({ id: z.string().uuid() });

const overviewSchema = z.object({ query: z.object({ month, year, branchId: z.string().uuid().optional() }) });
const generateSchema = z.object({
  body: z.object({ month, year, employee_ids: z.array(z.string().uuid()).optional() }),
});
const payslipBody = z.object({
  employee_id: z.string().uuid(),
  month,
  year,
  amount: money.optional(),
  bonus: money.optional(),
  allowances: money.optional(),
  deductions: money.optional(),
  advance_deduction: money.optional(),
  notes: z.string().max(500).nullable().optional(),
});
const createPayslipSchema = z.object({ body: payslipBody });
const updatePayslipSchema = z.object({
  params: id,
  body: payslipBody.omit({ employee_id: true, month: true, year: true }).partial(),
});
const paySchema = z.object({
  params: id,
  body: z.object({
    amount: money.optional(),
    method: z.string().max(40).optional(),
    date: ymd.optional(),
    reference: z.string().max(120).nullable().optional(),
  }),
});
const advanceSchema = z.object({
  body: z.object({
    employee_id: z.string().uuid(),
    type: z.enum(['ADVANCE', 'RECOVERY']),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    date: ymd.optional(),
    method: z.string().max(40).optional(),
    reference: z.string().max(120).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
  }),
});

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));

router.get(
  '/overview',
  validate(overviewSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const q = overviewSchema.shape.query.parse(req.query);
    const data = await service.overview({ ...q, userRole: req.user?.role, userBranchId: req.user?.branch_id });
    new ApiResponse(data, 'Payroll overview').send(res);
  }),
);

router.get(
  '/employees/:id',
  validate(z.object({ params: id })),
  asyncHandler(async (req: Request, res: Response) => {
    new ApiResponse(await service.finance(req.params.id), 'Employee finance').send(res);
  }),
);

router.post(
  '/generate',
  validate(generateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = generateSchema.shape.body.parse(req.body);
    const data = await service.generate({ month: body.month, year: body.year, employeeIds: body.employee_ids });
    new ApiResponse(data, `Payroll generated: ${data.created} payslip(s)`, 201).send(res);
  }),
);

router.post(
  '/salaries',
  validate(createPayslipSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await service.createPayslip(createPayslipSchema.shape.body.parse(req.body), req.user?.id);
    new ApiResponse(data, 'Payslip created', 201).send(res);
  }),
);

router.put(
  '/salaries/:id',
  validate(updatePayslipSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await service.updatePayslip(req.params.id, updatePayslipSchema.shape.body.parse(req.body), req.user?.id);
    new ApiResponse(data, 'Payslip updated').send(res);
  }),
);

router.post(
  '/salaries/:id/pay',
  validate(paySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await service.pay(req.params.id, paySchema.shape.body.parse(req.body));
    new ApiResponse(data, data.status === 'PAID' ? 'Salary paid in full' : 'Partial salary payment recorded').send(res);
  }),
);

router.post(
  '/salaries/:id/undo-payment',
  validate(z.object({ params: id })),
  asyncHandler(async (req: Request, res: Response) => {
    new ApiResponse(await service.undoPayment(req.params.id), 'Payment reversed').send(res);
  }),
);

router.delete(
  '/salaries/:id',
  validate(z.object({ params: id })),
  asyncHandler(async (req: Request, res: Response) => {
    new ApiResponse(await service.deletePayslip(req.params.id), 'Payslip deleted').send(res);
  }),
);

router.post(
  '/advances',
  validate(advanceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = advanceSchema.shape.body.parse(req.body);
    const data = await service.addAdvance(body, req.user?.id);
    new ApiResponse(data, body.type === 'ADVANCE' ? 'Advance recorded' : 'Recovery recorded', 201).send(res);
  }),
);

router.delete(
  '/advances/:id',
  validate(z.object({ params: id })),
  asyncHandler(async (req: Request, res: Response) => {
    new ApiResponse(await service.deleteAdvance(req.params.id), 'Entry deleted').send(res);
  }),
);

export default router;
