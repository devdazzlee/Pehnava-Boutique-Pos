"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BalanceSheetService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const purchase_report_service_1 = require("./purchase-report.service");
const register_report_calc_1 = require("./register-report.calc");
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const INCLUDED_STATUSES = ['COMPLETED', 'REFUNDED', 'EXCHANGED'];
const num = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const isRegenerated = (notes) => {
    const text = (notes || '').toLowerCase();
    return text.includes('[regenerated]') || text.includes('regenerated bill');
};
const cashierName = (email) => {
    if (!email)
        return '—';
    return email.includes('@') ? email.split('@')[0] : email;
};
class BalanceSheetService {
    async sheet(params) {
        const isAdmin = ADMIN_ROLES.has(params.userRole || '');
        const branches = await client_2.prisma.branch.findMany({
            where: { is_active: true },
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
        });
        let branchId = isAdmin ? params.branchId || params.userBranchId || undefined : params.userBranchId || undefined;
        if (!isAdmin && !branchId) {
            throw new apiError_1.AppError(400, 'Your account is not assigned to a branch');
        }
        const { start, end } = (0, purchase_report_service_1.localRange)(params.from, params.to);
        const asOf = end;
        const asOfDate = params.to;
        const scopedBranches = branchId ? branches.filter((row) => row.id === branchId) : branches;
        const [stocks, movementsAfter, cashflows, salesAsOf, customerPayments, customers, invoices, supplierPayments, periodSales, periodExpenseRows, periodSalaryRows,] = await Promise.all([
            client_2.prisma.stock.findMany({
                where: {
                    ...(branchId ? { branch_id: branchId } : {}),
                    product: { is_active: true, non_inventory_item: false },
                },
                include: {
                    product: { select: { purchase_rate: true, name: true, sku: true } },
                    branch: { select: { id: true, name: true, code: true } },
                },
            }),
            client_2.prisma.stockMovement.groupBy({
                by: ['product_id', 'branch_id'],
                where: {
                    created_at: { gt: asOf },
                    ...(branchId ? { branch_id: branchId } : {}),
                },
                _sum: { quantity_change: true },
            }),
            client_2.prisma.cashFlow.findMany({
                where: {
                    opened_at: { lte: asOf },
                    ...(branchId ? { branch_id: branchId } : {}),
                },
                include: {
                    expenses: true,
                    user: { select: { email: true } },
                    branch: { select: { id: true, name: true, code: true } },
                },
                orderBy: { opened_at: 'desc' },
            }),
            client_2.prisma.sale.findMany({
                where: {
                    sale_date: { lte: asOf },
                    status: { in: INCLUDED_STATUSES },
                    customer_id: { not: null },
                    ...(branchId ? { branch_id: branchId } : {}),
                },
                select: {
                    id: true,
                    customer_id: true,
                    sale_date: true,
                    total_amount: true,
                    payment_received: true,
                    original_sale_id: true,
                    notes: true,
                    status: true,
                },
            }),
            client_2.prisma.customerPayment.findMany({
                where: { payment_date: { lte: asOf } },
                select: { customer_id: true, amount: true, type: true },
            }),
            client_2.prisma.customer.findMany({
                where: { is_active: true },
                select: { id: true, name: true, previous_credit_balance: true },
            }),
            client_2.prisma.purchaseInvoice.findMany({
                where: {
                    invoice_date: { lte: asOf },
                    ...(branchId ? { branch_id: branchId } : {}),
                },
                select: {
                    id: true,
                    invoice_number: true,
                    supplier_id: true,
                    total_amount: true,
                    amount_paid: true,
                    status: true,
                    supplier: { select: { name: true } },
                },
            }),
            client_2.prisma.supplierPayment.findMany({
                where: {
                    payment_date: { lte: asOf },
                    purchase_invoice_id: { not: null },
                },
                select: { purchase_invoice_id: true, amount: true },
            }),
            client_2.prisma.sale.findMany({
                where: {
                    sale_date: { gte: start, lte: end },
                    status: { in: INCLUDED_STATUSES },
                    ...(branchId ? { branch_id: branchId } : {}),
                },
                include: {
                    sale_items: {
                        include: { product: { select: { purchase_rate: true } } },
                    },
                },
            }),
            client_2.prisma.expense.findMany({
                where: {
                    expense_date: { gte: start, lte: end },
                    status: 'APPROVED',
                    ...(branchId ? { branch_id: branchId } : {}),
                },
            }),
            client_2.prisma.salary.findMany({
                where: {
                    is_paid: true,
                    paid_date: { gte: start, lte: end },
                },
            }),
        ]);
        const movementAfterMap = new Map();
        for (const row of movementsAfter) {
            movementAfterMap.set(`${row.product_id}:${row.branch_id}`, num(row._sum.quantity_change));
        }
        let inventoryValue = 0;
        let inventoryQty = 0;
        const inventoryByBranch = new Map();
        for (const stock of stocks) {
            const key = `${stock.product_id}:${stock.branch_id}`;
            const after = movementAfterMap.get(key) || 0;
            const qty = round2(num(stock.current_quantity) - after);
            if (qty <= 0)
                continue;
            const value = round2(qty * num(stock.product.purchase_rate));
            inventoryValue += value;
            inventoryQty += qty;
            const branchRow = inventoryByBranch.get(stock.branch_id) || {
                name: stock.branch.name,
                code: stock.branch.code,
                value: 0,
                qty: 0,
            };
            branchRow.value += value;
            branchRow.qty += qty;
            inventoryByBranch.set(stock.branch_id, branchRow);
        }
        inventoryValue = round2(inventoryValue);
        inventoryQty = round2(inventoryQty);
        // Latest cash session per branch as of date
        const latestByBranch = new Map();
        for (const session of cashflows) {
            if (!session.branch_id)
                continue;
            if (!latestByBranch.has(session.branch_id)) {
                latestByBranch.set(session.branch_id, session);
            }
        }
        const openSessions = scopedBranches
            .map((branch) => {
            const session = latestByBranch.get(branch.id);
            if (!session)
                return null;
            const closedAsOf = session.status === 'CLOSED' &&
                session.closing != null &&
                (!session.closed_at || session.closed_at <= asOf);
            if (closedAsOf)
                return null;
            return { branch, session };
        })
            .filter(Boolean);
        const openSales = openSessions.length === 0
            ? []
            : await client_2.prisma.sale.findMany({
                where: {
                    status: { notIn: [client_1.SaleStatus.CANCELLED, client_1.SaleStatus.PENDING] },
                    sale_date: { lte: asOf },
                    OR: openSessions.map(({ branch, session }) => ({
                        branch_id: branch.id,
                        sale_date: { gte: session.opened_at },
                    })),
                },
            });
        let cashOnHand = 0;
        const cashByBranch = [];
        for (const branch of scopedBranches) {
            const session = latestByBranch.get(branch.id);
            if (!session) {
                cashByBranch.push({ id: branch.id, name: branch.name, code: branch.code, amount: 0, status: 'NONE' });
                continue;
            }
            let amount = 0;
            const closedAsOf = session.status === 'CLOSED' &&
                session.closing != null &&
                (!session.closed_at || session.closed_at <= asOf);
            if (closedAsOf) {
                amount = num(session.closing);
            }
            else {
                const sales = openSales.filter((sale) => sale.branch_id === branch.id && sale.sale_date >= session.opened_at);
                const expenses = (session.expenses || []).filter((expense) => expense.status === 'APPROVED' && expense.expense_date <= asOf);
                const report = (0, register_report_calc_1.buildRegisterReport)({
                    sessions: [
                        {
                            id: session.id,
                            branchId: session.branch_id,
                            registerName: branch.name,
                            registerNumber: branch.code,
                            cashierId: session.user_id,
                            cashierName: cashierName(session.user?.email),
                            openedAt: session.opened_at.toISOString(),
                            closedAt: null,
                            opening: num(session.opening),
                            closing: null,
                            status: 'OPEN',
                        },
                    ],
                    sales: sales.map((sale) => ({
                        id: sale.id,
                        saleNumber: sale.sale_number,
                        invoiceNumber: sale.invoice_number,
                        saleDate: sale.sale_date.toISOString(),
                        customerName: null,
                        cashierId: sale.created_by,
                        cashierName: null,
                        branchId: sale.branch_id,
                        subtotal: num(sale.subtotal),
                        discount: num(sale.discount_amount),
                        tax: num(sale.tax_amount),
                        total: num(sale.total_amount),
                        paymentMethod: sale.payment_method,
                        status: sale.status,
                        originalSaleId: sale.original_sale_id,
                        notes: sale.notes,
                    })),
                    expenses: expenses.map((expense) => ({
                        id: expense.id,
                        particular: expense.particular,
                        amount: num(expense.amount),
                        date: expense.expense_date.toISOString(),
                        paymentMethod: String(expense.payment_method),
                        status: expense.status,
                        cashierId: expense.created_by,
                        cashierName: null,
                        branchId: expense.branch_id,
                    })),
                    customerPayments: [],
                    filters: {},
                });
                amount = report.cash.expectedCash;
            }
            amount = round2(amount);
            cashOnHand += amount;
            cashByBranch.push({
                id: branch.id,
                name: branch.name,
                code: branch.code,
                amount,
                status: session.status,
            });
        }
        cashOnHand = round2(cashOnHand);
        // Accounts receivable as of date
        const arMap = new Map();
        for (const customer of customers) {
            arMap.set(customer.id, num(customer.previous_credit_balance));
        }
        for (const sale of salesAsOf) {
            if (!sale.customer_id || isRegenerated(sale.notes))
                continue;
            const current = arMap.get(sale.customer_id) || 0;
            const total = num(sale.total_amount);
            const received = num(sale.payment_received);
            if (!sale.original_sale_id) {
                arMap.set(sale.customer_id, current + total - Math.min(received, Math.max(total, 0)));
            }
            else {
                // Return/exchange child: negative total reduces what customer owes
                arMap.set(sale.customer_id, current + total);
            }
        }
        for (const payment of customerPayments) {
            const current = arMap.get(payment.customer_id) || 0;
            // Refunds / debit notes increase what the customer owes; every other type reduces it.
            const sign = payment.type === 'REFUND' || payment.type === 'DEBIT_NOTE' ? 1 : -1;
            arMap.set(payment.customer_id, current + sign * num(payment.amount));
        }
        let accountsReceivable = 0;
        let customerCredits = 0;
        const topReceivables = [];
        for (const customer of customers) {
            const balance = round2(arMap.get(customer.id) || 0);
            if (balance > 0.005) {
                accountsReceivable += balance;
                topReceivables.push({ id: customer.id, name: customer.name || 'Customer', balance });
            }
            else if (balance < -0.005) {
                customerCredits += Math.abs(balance);
            }
        }
        accountsReceivable = round2(accountsReceivable);
        customerCredits = round2(customerCredits);
        topReceivables.sort((a, b) => b.balance - a.balance);
        // Accounts payable as of date
        const paidByInvoice = new Map();
        for (const payment of supplierPayments) {
            if (!payment.purchase_invoice_id)
                continue;
            paidByInvoice.set(payment.purchase_invoice_id, (paidByInvoice.get(payment.purchase_invoice_id) || 0) + num(payment.amount));
        }
        let accountsPayable = 0;
        const topPayables = [];
        for (const invoice of invoices) {
            const paid = paidByInvoice.get(invoice.id) || 0;
            const balance = round2(num(invoice.total_amount) - paid);
            if (balance <= 0.005)
                continue;
            accountsPayable += balance;
            topPayables.push({
                id: invoice.id,
                supplier: invoice.supplier.name,
                invoice: invoice.invoice_number,
                balance,
            });
        }
        accountsPayable = round2(accountsPayable);
        topPayables.sort((a, b) => b.balance - a.balance);
        // Period net profit (equity movement disclosure)
        let periodRevenue = 0;
        let periodCogs = 0;
        for (const sale of periodSales) {
            if (isRegenerated(sale.notes))
                continue;
            for (const item of sale.sale_items) {
                periodRevenue += num(item.line_total);
                periodCogs += num(item.product.purchase_rate) * num(item.quantity);
            }
        }
        const periodExpenseTotal = round2(periodExpenseRows.reduce((sum, row) => sum + Math.abs(num(row.amount)), 0) +
            periodSalaryRows.reduce((sum, row) => sum + Math.abs((num(row.amount) + num(row.bonus) + num(row.allowances) - num(row.deductions))), 0));
        const periodNetProfit = round2(periodRevenue - periodCogs - periodExpenseTotal);
        const totalAssets = round2(cashOnHand + inventoryValue + accountsReceivable);
        const totalLiabilities = round2(accountsPayable + customerCredits);
        const equity = round2(totalAssets - totalLiabilities);
        return {
            period: { from: params.from, to: params.to },
            asOf: asOfDate,
            branchId: branchId || null,
            branches,
            assets: {
                cashOnHand,
                inventory: inventoryValue,
                inventoryQty,
                accountsReceivable,
                total: totalAssets,
                cashByBranch,
                inventoryByBranch: [...inventoryByBranch.entries()].map(([id, row]) => ({
                    id,
                    name: row.name,
                    code: row.code,
                    value: round2(row.value),
                    qty: round2(row.qty),
                })),
                topReceivables: topReceivables.slice(0, 10),
            },
            liabilities: {
                accountsPayable,
                customerCredits,
                total: totalLiabilities,
                topPayables: topPayables.slice(0, 10),
            },
            equity: {
                ownersEquity: equity,
                periodNetProfit,
                total: equity,
            },
            totals: {
                assets: totalAssets,
                liabilitiesAndEquity: round2(totalLiabilities + equity),
                balanced: Math.abs(totalAssets - (totalLiabilities + equity)) < 0.02,
            },
            lines: [
                { side: 'asset', label: 'Cash on hand', amount: cashOnHand },
                { side: 'asset', label: 'Inventory', amount: inventoryValue },
                { side: 'asset', label: 'Accounts receivable', amount: accountsReceivable },
                { side: 'asset', label: 'Total assets', amount: totalAssets, emphasis: true },
                { side: 'liability', label: 'Accounts payable', amount: accountsPayable },
                { side: 'liability', label: 'Customer credits', amount: customerCredits },
                { side: 'liability', label: 'Total liabilities', amount: totalLiabilities, emphasis: true },
                { side: 'equity', label: "Owner's equity", amount: equity },
                { side: 'equity', label: 'Net profit in period (memo)', amount: periodNetProfit },
                { side: 'equity', label: 'Total equity', amount: equity, emphasis: true },
                {
                    side: 'total',
                    label: 'Liabilities + equity',
                    amount: round2(totalLiabilities + equity),
                    emphasis: true,
                },
            ],
        };
    }
}
exports.BalanceSheetService = BalanceSheetService;
//# sourceMappingURL=balance-sheet.service.js.map