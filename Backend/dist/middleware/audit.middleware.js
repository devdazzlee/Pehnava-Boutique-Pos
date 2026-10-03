"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditTrail = auditTrail;
const audit_service_1 = require("../services/audit.service");
const ref = (r) => r?.invoice_number || r?.sale_number || r?.voucher_no || r?.po_number || r?.code || r?.name || r?.email || '';
const amt = (v) => (v === undefined || v === null || v === '' ? '' : ` Rs ${Number(v).toLocaleString('en-US')}`);
const RULES = [
    // Sales
    { method: 'POST', pattern: /^\/sale\/?$/, action: 'sale.create', category: 'sales', entity: 'sale', summary: ({ body, result }) => `Sale ${ref(result)}${amt(result?.total_amount)}${Number(body?.discountAmount) > 0 ? ` · discount${amt(body.discountAmount)}` : ''}${Array.isArray(body?.payments) && body.payments.length > 1 ? ' · split payment' : ''}` },
    { method: 'PATCH', pattern: /^\/sale\/[^/]+\/cancel$/, action: 'sale.void', category: 'sales', entity: 'sale', summary: ({ body, result }) => `Voided bill ${ref(result)}${amt(result?.total_amount)} — ${body?.reason || 'no reason'}` },
    { method: 'PATCH', pattern: /^\/sale\/[^/]+\/refund$/, action: 'sale.refund', category: 'sales', entity: 'sale', summary: ({ body, result }) => `${body?.transactionType === 'EXCHANGE' || body?.exchangedItems?.length ? 'Exchange' : 'Return / refund'} ${ref(result)}${amt(result?.total_amount)}${body?.refundMethod ? ` via ${body.refundMethod}` : ''}` },
    { method: 'PATCH', pattern: /^\/sale\/[^/]+$/, action: 'sale.edit', category: 'sales', entity: 'sale', summary: ({ body, result }) => `Edited bill ${ref(result)}: ${Object.keys(body || {}).filter((k) => k !== 'items').join(', ')}${body?.items ? ', items' : ''}` },
    { method: 'DELETE', pattern: /^\/sale\/[^/]+$/, action: 'sale.delete', category: 'sales', entity: 'sale', summary: ({ id }) => `Deleted bill ${id}` },
    { method: 'POST', pattern: /^\/sale\/hold/, action: 'sale.hold', category: 'sales', entity: 'hold_sale', summary: () => 'Held / retrieved a sale' },
    // Products & stock
    { method: 'POST', pattern: /^\/products\/?$/, action: 'product.create', category: 'inventory', entity: 'product', summary: ({ result }) => `Created product ${ref(result)}` },
    { method: 'PATCH', pattern: /^\/products\/[^/]+$/, action: 'product.update', category: 'inventory', entity: 'product', summary: ({ body, result }) => `Updated product ${result?.name || ''}: ${Object.keys(body || {}).slice(0, 8).join(', ')}` },
    { method: 'DELETE', pattern: /^\/products\/[^/]+$/, action: 'product.delete', category: 'inventory', entity: 'product', summary: ({ id }) => `Deleted product ${id}` },
    { method: 'POST', pattern: /^\/stock-adjustments/, action: 'inventory.adjust', category: 'inventory', entity: 'stock_adjustment', summary: ({ body }) => `Stock adjustment${body?.adjustment_category ? ` (${body.adjustment_category})` : ''}${body?.reason ? ` — ${body.reason}` : ''}` },
    { method: 'POST', pattern: /^\/transfers/, action: 'inventory.transfer', category: 'inventory', entity: 'transfer', summary: () => 'Stock transfer' },
    { method: 'POST', pattern: /^\/stock-out/, action: 'inventory.stock_out', category: 'inventory', entity: 'stock_out', summary: () => 'Stock out' },
    { method: 'POST', pattern: /^\/purchases/, action: 'purchase.receive', category: 'suppliers', entity: 'purchase', summary: () => 'Stock in / goods received' },
    // Cash register
    { method: 'POST', pattern: /^\/till\/open/, action: 'register.open', category: 'cash', entity: 'register', summary: ({ body }) => `Opened register with${amt(body?.opening)}` },
    { method: 'POST', pattern: /^\/till\/paid-out/, action: 'register.paid_out', category: 'cash', entity: 'register', summary: ({ body }) => `Cash out${amt(body?.amount)} — ${body?.particular || ''}` },
    { method: 'POST', pattern: /^\/till\/close/, action: 'register.close', category: 'cash', entity: 'register', summary: ({ body }) => `Closed register, counted${amt(body?.closing)}` },
    { method: 'POST', pattern: /^\/till\/reopen/, action: 'register.reopen', category: 'cash', entity: 'register', summary: () => 'Reopened a closed register' },
    { method: 'POST', pattern: /^\/register/, action: 'register.change', category: 'cash', entity: 'register', summary: () => 'Register change' },
    // Expenses
    { method: 'POST', pattern: /^\/expenses\/?$/, action: 'expense.create', category: 'expenses', entity: 'expense', summary: ({ body }) => `Expense ${body?.particular || ''}${amt(body?.amount)}` },
    { method: 'PATCH', pattern: /^\/expenses\/[^/]+\/approve$/, action: 'expense.approve', category: 'expenses', entity: 'expense', summary: ({ result }) => `Approved expense ${result?.particular || ''}${amt(result?.amount)}` },
    { method: 'PATCH', pattern: /^\/expenses\/[^/]+\/reject$/, action: 'expense.reject', category: 'expenses', entity: 'expense', summary: ({ body, result }) => `Rejected expense ${result?.particular || ''}${body?.reason ? ` — ${body.reason}` : ''}` },
    { method: 'PATCH', pattern: /^\/expenses\/[^/]+$/, action: 'expense.update', category: 'expenses', entity: 'expense', summary: ({ body }) => `Edited expense: ${Object.keys(body || {}).join(', ')}` },
    { method: 'DELETE', pattern: /^\/expenses\/[^/]+$/, action: 'expense.delete', category: 'expenses', entity: 'expense', summary: ({ id }) => `Deleted expense ${id}` },
    // Customers & suppliers
    { method: 'POST', pattern: /^\/customer\/[^/]+\/payments/, action: 'customer.transaction', category: 'customers', entity: 'customer', summary: ({ body }) => `${body?.type || 'PAYMENT'}${amt(body?.amount)}` },
    { method: 'DELETE', pattern: /^\/customer\/[^/]+\/payments/, action: 'customer.transaction_delete', category: 'customers', entity: 'customer', summary: () => 'Deleted a customer transaction' },
    { method: 'POST', pattern: /^\/suppliers\/[^/]+\/payments/, action: 'supplier.payment', category: 'suppliers', entity: 'supplier', summary: ({ body }) => `Supplier payment${amt(body?.amount)}` },
    // Staff & payroll
    { method: 'POST', pattern: /^\/payroll\/salaries\/[^/]+\/pay/, action: 'payroll.pay', category: 'staff', entity: 'salary', summary: ({ body, result }) => `Salary paid${amt(body?.amount ?? result?.paid_amount)} (${result?.period_label || ''})` },
    { method: 'POST', pattern: /^\/payroll\/advances/, action: 'payroll.advance', category: 'staff', entity: 'advance', summary: ({ body }) => `${body?.type === 'RECOVERY' ? 'Advance recovered' : 'Advance given'}${amt(body?.amount)}` },
    // Accounts
    { method: 'POST', pattern: /^\/chart-of-accounts\/vouchers/, action: 'accounts.voucher', category: 'accounts', entity: 'journal_voucher', summary: ({ result }) => `Journal voucher ${ref(result)}${amt(result?.total)}` },
    // Users & permissions (explicit entries are also written by those routes)
    { method: 'POST', pattern: /^\/users/, action: 'user.change', category: 'security', entity: 'user', summary: ({ result }) => `User change ${ref(result)}` },
    { method: 'PATCH', pattern: /^\/users/, action: 'user.change', category: 'security', entity: 'user', summary: ({ result }) => `User change ${ref(result)}` },
];
const CATEGORY_BY_PREFIX = [
    [/^\/(sale|order)/, 'sales'],
    [/^\/(products|stock|inventory|transfers|categories|subcategories|brands|colors|sizes|units)/, 'inventory'],
    [/^\/(till|cashflows|register)/, 'cash'],
    [/^\/expenses/, 'expenses'],
    [/^\/customer/, 'customers'],
    [/^\/(suppliers|purchase)/, 'suppliers'],
    [/^\/(employee|salaries|payroll|commissions|shift)/, 'staff'],
    [/^\/chart-of-accounts/, 'accounts'],
    [/^\/(users|permissions|auth)/, 'security'],
];
const SKIP = [/^\/audit/, /^\/auth\/login/, /^\/products\/upload-image/, /^\/customer\/(login|register|logout)/, /^\/payments\/alfalah/, /^\/guest/, /^\/web/, /^\/app\//];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function auditTrail(apiPrefix) {
    return (req, res, next) => {
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !req.originalUrl.startsWith(apiPrefix))
            return next();
        const path = req.originalUrl.slice(apiPrefix.length).split('?')[0] || '/';
        if (SKIP.some((r) => r.test(path)))
            return next();
        // Record right before the JSON response is sent, so the entry is written
        // even on serverless hosts that freeze the function after responding.
        const json = res.json.bind(res);
        res.json = ((body) => {
            if (res.statusCode >= 400 || !req.user)
                return json(body);
            const result = body?.data ?? null;
            const rule = RULES.find((r) => r.method === req.method && r.pattern.test(path));
            const id = path.match(UUID)?.[0] ?? (result && typeof result === 'object' ? result.id : null) ?? null;
            const ctx = { body: req.body, result, id };
            const category = rule?.category ?? CATEGORY_BY_PREFIX.find(([r]) => r.test(path))?.[1] ?? 'other';
            let summary;
            try {
                summary = rule ? rule.summary(ctx) : `${req.method} ${path}`;
            }
            catch {
                summary = `${req.method} ${path}`;
            }
            const meta = (0, audit_service_1.requestMeta)(req);
            (0, audit_service_1.audit)({
                action: rule?.action ?? `${req.method.toLowerCase()}.${path.split('/')[1] || 'root'}`,
                category,
                summary,
                entity: rule?.entity ?? path.split('/')[1] ?? null,
                entityId: id,
                details: { method: req.method, path, body: (0, audit_service_1.sanitize)(req.body) },
                userId: req.user.id,
                userRole: req.user.role,
                branchId: req.user.branch_id ?? null,
                approvedById: req.approval?.id ?? null,
                approvedByEmail: req.approval?.email ?? null,
                ip: meta.ip,
                userAgent: meta.userAgent,
                statusCode: res.statusCode,
            }).finally(() => json(body));
            return res;
        });
        next();
    };
}
//# sourceMappingURL=audit.middleware.js.map