"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrialBalanceService = void 0;
const balance_sheet_service_1 = require("./balance-sheet.service");
const financial_statement_service_1 = require("./financial-statement.service");
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
class TrialBalanceService {
    balanceSheet = new balance_sheet_service_1.BalanceSheetService();
    financialStatement = new financial_statement_service_1.FinancialStatementService();
    async trial(params) {
        const [sheet, statement] = await Promise.all([
            this.balanceSheet.sheet(params),
            this.financialStatement.statement({
                ...params,
                includeSalaries: true,
                includePurchases: true,
                comparePrevious: false,
            }),
        ]);
        const accounts = [];
        const push = (code, account, type, debit, credit) => {
            const d = round2(Math.max(0, debit));
            const c = round2(Math.max(0, credit));
            if (d < 0.005 && c < 0.005)
                return;
            accounts.push({ code, account, type, debit: d, credit: c });
        };
        // Assets (as of end date)
        push('1000', 'Cash on hand', 'asset', sheet.assets.cashOnHand, 0);
        push('1200', 'Inventory', 'asset', sheet.assets.inventory, 0);
        push('1300', 'Accounts receivable', 'asset', sheet.assets.accountsReceivable, 0);
        // Liabilities
        push('2000', 'Accounts payable', 'liability', 0, sheet.liabilities.accountsPayable);
        push('2100', 'Customer credits', 'liability', 0, sheet.liabilities.customerCredits);
        // Income (period)
        push('4000', 'Sales revenue', 'income', 0, statement.income.grossSales);
        push('4100', 'Sales discounts', 'income', statement.income.discounts, 0);
        push('4200', 'Sales returns', 'income', statement.income.returns, 0);
        // Expenses / COGS (period)
        push('5000', 'Cost of goods sold', 'expense', statement.cogs.soldCost, 0);
        statement.expenses.byCategory.forEach((row, index) => {
            const code = `51${String(index + 1).padStart(2, '0')}`;
            push(code, row.name, 'expense', row.amount, 0);
        });
        let totalDebit = round2(accounts.reduce((sum, row) => sum + row.debit, 0));
        let totalCredit = round2(accounts.reduce((sum, row) => sum + row.credit, 0));
        const difference = round2(totalDebit - totalCredit);
        // Equity balancing figure so debit total equals credit total
        if (Math.abs(difference) >= 0.005) {
            if (difference > 0) {
                push('3000', "Owner's equity / capital", 'equity', 0, difference);
            }
            else {
                push('3000', "Owner's equity / capital", 'equity', Math.abs(difference), 0);
            }
        }
        totalDebit = round2(accounts.reduce((sum, row) => sum + row.debit, 0));
        totalCredit = round2(accounts.reduce((sum, row) => sum + row.credit, 0));
        const byType = {
            asset: round2(accounts.filter((r) => r.type === 'asset').reduce((s, r) => s + r.debit - r.credit, 0)),
            liability: round2(accounts.filter((r) => r.type === 'liability').reduce((s, r) => s + r.credit - r.debit, 0)),
            equity: round2(accounts.filter((r) => r.type === 'equity').reduce((s, r) => s + r.credit - r.debit, 0)),
            income: round2(accounts.filter((r) => r.type === 'income').reduce((s, r) => s + r.credit - r.debit, 0)),
            expense: round2(accounts.filter((r) => r.type === 'expense').reduce((s, r) => s + r.debit - r.credit, 0)),
        };
        return {
            period: { from: params.from, to: params.to },
            asOf: sheet.asOf,
            branchId: sheet.branchId,
            branches: sheet.branches,
            accounts: accounts.sort((a, b) => a.code.localeCompare(b.code)),
            totals: {
                debit: totalDebit,
                credit: totalCredit,
                difference: round2(totalDebit - totalCredit),
                balanced: Math.abs(totalDebit - totalCredit) < 0.02,
                accountCount: accounts.length,
            },
            byType,
            memo: {
                periodNetProfit: statement.netProfit,
                grossProfit: statement.grossProfit,
                netRevenue: statement.income.netRevenue,
            },
        };
    }
}
exports.TrialBalanceService = TrialBalanceService;
//# sourceMappingURL=trial-balance.service.js.map