"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashFlowService = void 0;
const client_1 = require("../prisma/client");
const timezone_1 = require("../utils/timezone");
class CashFlowService {
    async getCashFlowByDate(branch_id, date) {
        const { start: startOfDay, end: endOfDay } = (0, timezone_1.localRange)(date, date);
        const cashFlow = await client_1.prisma.cashFlow.findFirst({
            where: {
                branch_id,
                opened_at: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
            include: { expenses: true },
        });
        if (!cashFlow) {
            return { exists: false, data: null };
        }
        return { exists: true, data: cashFlow };
    }
    async createOpeningCashFlow(data) {
        const cashFlow = await client_1.prisma.cashFlow.create({
            data: {
                opening: data.opening,
                sales: data.sales,
                closing: null,
                branch_id: data.branch_id,
                user_id: data.user_id,
                status: 'OPEN',
                opened_at: new Date(),
            },
        });
        return cashFlow;
    }
    async addExpense(data) {
        const expense = await client_1.prisma.expense.create({
            data: {
                particular: data.particular,
                amount: data.amount,
                cashflow_id: data.cashflow_id,
                // Petty cash already left the drawer — it is not part of the approval
                // queue in the Expenses module.
                payment_method: 'CASH',
                status: 'APPROVED',
                approved_at: new Date(),
            },
        });
        return expense;
    }
    async addClosing(cashflow_id, closing, userId, role) {
        const { RegisterReportService } = await Promise.resolve().then(() => __importStar(require('./register-report.service')));
        return new RegisterReportService().closeSession(cashflow_id, closing, userId, role);
    }
    async listCashFlows({ page = 1, limit = 10, branch_id, }) {
        const whereClause = branch_id ? { branch_id } : {};
        const [cashFlows, total] = await Promise.all([
            client_1.prisma.cashFlow.findMany({
                where: whereClause,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: { expenses: true },
            }),
            client_1.prisma.cashFlow.count({ where: whereClause }),
        ]);
        return {
            data: cashFlows,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    async findOpenDrawer(branch_id) {
        const { start: startOfDay, end: endOfDay } = (0, timezone_1.businessTodayRange)();
        return client_1.prisma.cashFlow.findFirst({
            where: {
                branch_id,
                status: 'OPEN',
                opened_at: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
        });
    }
    async findAnyDrawerToday(branch_id) {
        const { start: startOfDay, end: endOfDay } = (0, timezone_1.businessTodayRange)();
        return client_1.prisma.cashFlow.findFirst({
            where: {
                branch_id,
                opened_at: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
        });
    }
    async getExpensesByDate(branch_id, date) {
        // First, try to find the currently open drawer for this branch
        let cashFlow = await client_1.prisma.cashFlow.findFirst({
            where: {
                branch_id,
                status: 'OPEN',
            },
            include: { expenses: true },
        });
        if (cashFlow) {
            return cashFlow.expenses || [];
        }
        const { start: startOfDay, end: endOfDay } = date
            ? (0, timezone_1.businessDayRange)(date, date)
            : (0, timezone_1.businessTodayRange)();
        cashFlow = await client_1.prisma.cashFlow.findFirst({
            where: {
                branch_id,
                opened_at: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
            include: { expenses: true },
        });
        return cashFlow?.expenses || [];
    }
}
exports.CashFlowService = CashFlowService;
//# sourceMappingURL=cashflow.service.js.map