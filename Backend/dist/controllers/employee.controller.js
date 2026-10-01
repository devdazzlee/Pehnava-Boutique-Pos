"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEmployeeType = exports.toggleEmployeeType = exports.updateEmployeeType = exports.getEmployeeTypeById = exports.getEmployeeTypes = exports.createEmployeeType = exports.importEmployees = exports.deleteDepartment = exports.updateDepartment = exports.listDepartments = exports.createDepartment = exports.deleteEmployee = exports.reactivateEmployee = exports.deactivateEmployee = exports.updateEmployee = exports.getEmployeeById = exports.listEmployees = exports.createEmployee = exports.listPosUsers = void 0;
const employee_service_1 = require("../services/employee.service");
const employeeType_service_1 = require("../services/employeeType.service");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const apiResponse_1 = require("../utils/apiResponse");
const employeeService = new employee_service_1.EmployeeService();
const employeeTypeService = new employeeType_service_1.EmployeeTypeService();
exports.listPosUsers = (0, asyncHandler_1.default)(async (_req, res) => {
    const users = await employeeService.listPosUsers();
    new apiResponse_1.ApiResponse(users, 'POS users fetched successfully').send(res);
});
exports.createEmployee = (0, asyncHandler_1.default)(async (req, res) => {
    const employee = await employeeService.createEmployee(req.body, req.user?.branch_id);
    new apiResponse_1.ApiResponse(employee, 'Employee created successfully', 201).send(res);
});
exports.listEmployees = (0, asyncHandler_1.default)(async (req, res) => {
    const { page = 1, limit = 10, search, status, department_id, employee_type_id, employment_type, fetch_all, } = req.query;
    const result = await employeeService.listEmployees({
        branch_id: req.user?.branch_id,
        page: Number(page),
        limit: Number(limit),
        search: search,
        status: status,
        department_id: department_id,
        employee_type_id: employee_type_id,
        employment_type: employment_type,
        fetch_all: String(fetch_all) === 'true',
    });
    new apiResponse_1.ApiResponse(result.data, 'Employees fetched successfully', 200, true, result.meta).send(res);
});
exports.getEmployeeById = (0, asyncHandler_1.default)(async (req, res) => {
    const employee = await employeeService.getEmployeeById(req.params.id);
    new apiResponse_1.ApiResponse(employee, 'Employee fetched successfully', 200).send(res);
});
exports.updateEmployee = (0, asyncHandler_1.default)(async (req, res) => {
    const { id } = req.params;
    const updatedEmployee = await employeeService.updateEmployee(id, req.body);
    new apiResponse_1.ApiResponse(updatedEmployee, 'Employee updated successfully', 200).send(res);
});
exports.deactivateEmployee = (0, asyncHandler_1.default)(async (req, res) => {
    const employee = await employeeService.deactivateEmployee(req.params.id, req.body);
    new apiResponse_1.ApiResponse(employee, 'Employee deactivated successfully', 200).send(res);
});
exports.reactivateEmployee = (0, asyncHandler_1.default)(async (req, res) => {
    const employee = await employeeService.reactivateEmployee(req.params.id);
    new apiResponse_1.ApiResponse(employee, 'Employee reactivated successfully', 200).send(res);
});
exports.deleteEmployee = (0, asyncHandler_1.default)(async (req, res) => {
    const { id } = req.params;
    await employeeService.deleteEmployee(id);
    new apiResponse_1.ApiResponse(null, 'Employee deleted successfully', 200).send(res);
});
exports.createDepartment = (0, asyncHandler_1.default)(async (req, res) => {
    const department = await employeeService.createDepartment(req.body);
    new apiResponse_1.ApiResponse(department, 'Department created successfully', 201).send(res);
});
exports.listDepartments = (0, asyncHandler_1.default)(async (req, res) => {
    const raw = req.query.fetch_all;
    const fetch_all = String(raw) === 'true';
    const departments = await employeeService.listDepartments(fetch_all);
    new apiResponse_1.ApiResponse(departments, 'Departments fetched successfully', 200).send(res);
});
exports.updateDepartment = (0, asyncHandler_1.default)(async (req, res) => {
    const department = await employeeService.updateDepartment(req.params.id, req.body);
    new apiResponse_1.ApiResponse(department, 'Department updated successfully', 200).send(res);
});
exports.deleteDepartment = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await employeeService.deleteDepartment(req.params.id);
    new apiResponse_1.ApiResponse(result, 'Department deleted successfully', 200).send(res);
});
exports.importEmployees = (0, asyncHandler_1.default)(async (req, res) => {
    const result = await employeeService.importEmployees(req.body.rows, req.user?.branch_id);
    new apiResponse_1.ApiResponse(result, 'Employee import completed', 200).send(res);
});
/* --------------------- employee types / designations --------------------- */
exports.createEmployeeType = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await employeeTypeService.create(req.body);
    new apiResponse_1.ApiResponse(data, 'Employee type created successfully', 201).send(res);
});
exports.getEmployeeTypes = (0, asyncHandler_1.default)(async (req, res) => {
    const search = req.query.search;
    const isActiveRaw = req.query.is_active;
    const is_active = isActiveRaw === 'true' ? true : isActiveRaw === 'false' ? false : undefined;
    const data = await employeeTypeService.getAll({ search, is_active });
    new apiResponse_1.ApiResponse(data, 'Employee types retrieved successfully').send(res);
});
exports.getEmployeeTypeById = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await employeeTypeService.getById(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Employee type retrieved successfully').send(res);
});
exports.updateEmployeeType = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await employeeTypeService.update(req.params.id, req.body);
    new apiResponse_1.ApiResponse(data, 'Employee type updated successfully').send(res);
});
exports.toggleEmployeeType = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await employeeTypeService.toggleActive(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Designation status updated successfully').send(res);
});
exports.deleteEmployeeType = (0, asyncHandler_1.default)(async (req, res) => {
    const data = await employeeTypeService.delete(req.params.id);
    new apiResponse_1.ApiResponse(data, 'Employee type deleted successfully').send(res);
});
//# sourceMappingURL=employee.controller.js.map