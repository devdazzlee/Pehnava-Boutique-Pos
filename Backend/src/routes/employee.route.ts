import express from 'express';
import {
  createDepartment,
  createEmployee,
  deactivateEmployee,
  deleteDepartment,
  deleteEmployee,
  getEmployeeById,
  importEmployees,
  listDepartments,
  listEmployees,
  listPosUsers,
  reactivateEmployee,
  updateDepartment,
  updateEmployee,
} from '../controllers/employee.controller';
import {
  createDepartmentSchema,
  createEmployeeSchema,
  createEmployeeTypeSchema,
  deactivateEmployeeSchema,
  deleteDepartmentSchema,
  deleteEmployeeSchema,
  getEmployeeByIdSchema,
  importEmployeesSchema,
  listDepartmentsSchema,
  listEmployeeSchema,
  reactivateEmployeeSchema,
  updateDepartmentSchema,
  updateEmployeeSchema,
  updateEmployeeTypeSchema,
} from '../validations/employee.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  createEmployeeType,
  deleteEmployeeType,
  getEmployeeTypeById,
  getEmployeeTypes,
  toggleEmployeeType,
  updateEmployeeType,
} from '../controllers/employee.controller';

const router = express.Router();

router.use(authenticate, authorize(['ADMIN', 'SUPER_ADMIN']));

// Employee types (must be before /:id)
router.post('/type', validate(createEmployeeTypeSchema), createEmployeeType);
router.get('/types', getEmployeeTypes);
router.get('/type/:id', getEmployeeTypeById);
router.put('/type/:id', validate(updateEmployeeTypeSchema), updateEmployeeType);
router.patch('/type/:id/toggle-status', toggleEmployeeType);
router.delete('/type/:id', deleteEmployeeType);

// Departments
router.post('/departments', validate(createDepartmentSchema), createDepartment);
router.get('/departments', validate(listDepartmentsSchema), listDepartments);
router.put('/departments/:id', validate(updateDepartmentSchema), updateDepartment);
router.delete('/departments/:id', validate(deleteDepartmentSchema), deleteDepartment);

// Bulk import
router.post('/import', validate(importEmployeesSchema), importEmployees);

// POS users for linking cashiers → employees (commission)
router.get('/pos-users', listPosUsers);

// Deactivate / reactivate
router.patch('/:id/deactivate', validate(deactivateEmployeeSchema), deactivateEmployee);
router.patch('/:id/reactivate', validate(reactivateEmployeeSchema), reactivateEmployee);

// Detail
router.get('/:id', validate(getEmployeeByIdSchema), getEmployeeById);

// CRUD
router.post('/', validate(createEmployeeSchema), createEmployee);
router.get('/', validate(listEmployeeSchema), listEmployees);
router.put('/:id', validate(updateEmployeeSchema), updateEmployee);
router.delete('/:id', validate(deleteEmployeeSchema), deleteEmployee);

export default router;
