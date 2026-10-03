"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChartOfAccountsService = exports.ACCOUNT_TYPES = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const helpers_1 = require("../utils/helpers");
const timezone_1 = require("../utils/timezone");
const balance_sheet_service_1 = require("./balance-sheet.service");
const financial_statement_service_1 = require("./financial-statement.service");
const period_lock_service_1 = require("./period-lock.service");
/* ============================================================
 * Chart of Accounts
 *
 *   Level 1  Type                  1 digit   (fixed)        5
 *   Level 2  Sub Type              2 digits                 52
 *   Level 3  Control Account       3 digits                 522
 *   Level 4  Transactional Account 7 digits                 5220001
 *
 * Balances are derived from the POS modules (expenses, salaries,
 * commissions, supplier invoices / payments, sales, stock, cash
 * register) plus manual journal vouchers and opening balances.
 * ============================================================ */
exports.ACCOUNT_TYPES = [
    { code: 1, name: 'Asset', nature: 'DEBIT' },
    { code: 2, name: 'Liability', nature: 'CREDIT' },
    { code: 3, name: 'Equity', nature: 'CREDIT' },
    { code: 4, name: 'Income', nature: 'CREDIT' },
    { code: 5, name: 'Expense', nature: 'DEBIT' },
];
const TYPE_NAME = new Map(exports.ACCOUNT_TYPES.map((t) => [t.code, t.name]));
const isProfitLossType = (typeCode) => typeCode === 4 || typeCode === 5;
const isDebitNature = (typeCode) => typeCode === 1 || typeCode === 5;
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const ALL_DATES_FROM = '2000-01-01';
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
/** System accounts whose balance is read from existing POS reports instead of postings. */
const COMPUTED_KEYS = new Set([
    'CASH',
    'INVENTORY',
    'RECEIVABLES',
    'CUSTOMER_CREDITS',
    'SALES',
    'SALES_DISCOUNTS',
    'SALES_RETURNS',
    'COGS',
]);
const COMPUTED_SOURCE = {
    CASH: 'Cash register sessions (Balance Sheet)',
    INVENTORY: 'Stock value at purchase rate (Balance Sheet)',
    RECEIVABLES: 'Customer credit sales less payments (Balance Sheet)',
    CUSTOMER_CREDITS: 'Customer advances / store credit (Balance Sheet)',
    SALES: 'Gross sales (Financial Statement)',
    SALES_DISCOUNTS: 'Sales discounts (Financial Statement)',
    SALES_RETURNS: 'Sales returns (Financial Statement)',
    COGS: 'Sold items × purchase rate (Financial Statement)',
};
const DEFAULT_CHART = [
    {
        code: '11',
        name: 'Current Assets',
        system: true,
        controls: [
            {
                code: '111',
                name: 'Cash & Bank',
                systemKey: 'CASH_BANK',
                accounts: [{ name: 'Cash in Hand', systemKey: 'CASH' }, { name: 'Bank Account' }, { name: 'Petty Cash' }],
            },
            {
                code: '112',
                name: 'Trade Receivables',
                systemKey: 'TRADE_RECEIVABLES',
                accounts: [{ name: 'Customers Receivable', systemKey: 'RECEIVABLES' }],
            },
            {
                code: '113',
                name: 'Stock in Trade',
                systemKey: 'STOCK',
                accounts: [{ name: 'Inventory', systemKey: 'INVENTORY' }],
            },
            {
                code: '114',
                name: 'Advances & Deposits',
                accounts: [{ name: 'Staff Loans & Advances' }, { name: 'Security Deposits' }, { name: 'Advance Rent' }],
            },
        ],
    },
    {
        code: '12',
        name: 'Fixed Assets',
        controls: [
            { code: '121', name: 'Furniture & Fixtures', accounts: [{ name: 'Shop Furniture & Fixtures' }] },
            {
                code: '122',
                name: 'Equipment',
                accounts: [{ name: 'Computers & POS Hardware' }, { name: 'Air Conditioners & Electronics' }],
            },
        ],
    },
    {
        code: '21',
        name: 'Current Liabilities',
        system: true,
        controls: [
            { code: '211', name: 'Trade Payables (Suppliers)', systemKey: 'TRADE_PAYABLES', accounts: [] },
            {
                code: '212',
                name: 'Other Payables',
                systemKey: 'OTHER_PAYABLES',
                accounts: [
                    { name: 'Customer Advances & Credits', systemKey: 'CUSTOMER_CREDITS' },
                    { name: 'Salaries Payable' },
                    { name: 'Utility Bills Payable' },
                    { name: 'Tax Payable' },
                ],
            },
        ],
    },
    {
        code: '22',
        name: 'Long Term Liabilities',
        controls: [{ code: '221', name: 'Long Term Loans', accounts: [{ name: 'Bank Loan' }] }],
    },
    {
        code: '31',
        name: 'Capital',
        system: true,
        controls: [
            {
                code: '311',
                name: "Owner's Equity",
                systemKey: 'CAPITAL',
                accounts: [{ name: "Owner's Capital", systemKey: 'OWNER_CAPITAL' }, { name: "Owner's Drawings" }],
            },
        ],
    },
    {
        code: '41',
        name: 'Sales Revenue',
        system: true,
        controls: [
            {
                code: '411',
                name: 'Sales',
                systemKey: 'SALES_CONTROL',
                accounts: [
                    { name: 'Sales Revenue', systemKey: 'SALES' },
                    { name: 'Sales Discounts', systemKey: 'SALES_DISCOUNTS' },
                    { name: 'Sales Returns', systemKey: 'SALES_RETURNS' },
                ],
            },
        ],
    },
    {
        code: '42',
        name: 'Other Income',
        controls: [
            { code: '421', name: 'Other Income', accounts: [{ name: 'Miscellaneous Income' }, { name: 'Alteration / Stitching Income' }] },
        ],
    },
    {
        code: '51',
        name: 'Direct Expenses',
        system: true,
        controls: [
            {
                code: '511',
                name: 'Cost of Sales',
                systemKey: 'COST_OF_SALES',
                accounts: [{ name: 'Cost of Goods Sold', systemKey: 'COGS' }, { name: 'Freight & Cartage Inward' }, { name: 'Stitching & Tailoring Charges' }],
            },
        ],
    },
    {
        code: '52',
        name: 'Indirect Expenses',
        system: true,
        controls: [
            {
                code: '521',
                name: 'Expenses Control',
                systemKey: 'GENERAL_EXPENSES',
                accounts: [{ name: 'Miscellaneous Expense', systemKey: 'MISC_EXPENSE' }],
            },
            { code: '522', name: 'Payroll Expense', systemKey: 'PAYROLL', accounts: [] },
            {
                code: '523',
                name: 'Utility Expenses',
                systemKey: 'UTILITIES',
                accounts: [{ name: 'Electricity Bill' }, { name: 'Gas Bill' }, { name: 'Water Bill' }, { name: 'Internet & Telephone' }],
            },
            {
                code: '524',
                name: 'Office Expenses',
                systemKey: 'OFFICE',
                accounts: [
                    { name: 'Shop / Office Rent' },
                    { name: 'Stationery & Printing' },
                    { name: 'Tea & Refreshment' },
                    { name: 'Cleaning & Maintenance' },
                    { name: 'Repair & Maintenance' },
                ],
            },
            {
                code: '525',
                name: 'Selling & Marketing',
                accounts: [{ name: 'Advertisement & Promotion' }, { name: 'Packing Material' }, { name: 'Delivery Charges' }],
            },
        ],
    },
];
const ACCOUNT_LIST_INCLUDE = {
    control: { select: { id: true, code: true, name: true, sub_type: { select: { id: true, code: true, name: true, type_code: true } } } },
    employee: { select: { id: true, name: true, employee_code: true } },
    supplier: { select: { id: true, name: true, code: true } },
    expense_category: { select: { id: true, name: true } },
};
const clean = (value) => {
    const v = value?.trim();
    return v ? v : null;
};
const monthLabel = (month, year) => new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
let setupPromise = null;
class ChartOfAccountsService {
    balanceSheet = new balance_sheet_service_1.BalanceSheetService();
    financialStatement = new financial_statement_service_1.FinancialStatementService();
    /* ======================= setup & syncing ======================= */
    /** Seeds the default chart once and guarantees system accounts exist. Cached per process. */
    async ensureSetup() {
        if (!setupPromise) {
            setupPromise = this.runSetup().catch((error) => {
                setupPromise = null;
                throw error;
            });
        }
        await setupPromise;
    }
    async runSetup() {
        const existing = await client_2.prisma.accountSubType.count();
        if (existing === 0)
            await this.seedDefaults();
        await this.ensureSystemAccounts();
    }
    async seedDefaults() {
        await client_2.prisma.accountSubType.createMany({
            data: DEFAULT_CHART.map((s) => ({
                code: s.code,
                name: s.name,
                type_code: Number(s.code[0]),
                is_system: Boolean(s.system),
            })),
            skipDuplicates: true,
        });
        const subTypes = await client_2.prisma.accountSubType.findMany({ select: { id: true, code: true } });
        const subByCode = new Map(subTypes.map((s) => [s.code, s.id]));
        const controlRows = [];
        for (const sub of DEFAULT_CHART) {
            const subId = subByCode.get(sub.code);
            if (!subId)
                continue;
            for (const control of sub.controls) {
                controlRows.push({
                    code: control.code,
                    name: control.name,
                    sub_type_id: subId,
                    system_key: control.systemKey ?? null,
                    is_system: Boolean(control.systemKey),
                });
            }
        }
        await client_2.prisma.controlAccount.createMany({ data: controlRows, skipDuplicates: true });
        const controls = await client_2.prisma.controlAccount.findMany({ select: { id: true, code: true } });
        const controlByCode = new Map(controls.map((c) => [c.code, c.id]));
        const accountRows = [];
        for (const sub of DEFAULT_CHART) {
            for (const control of sub.controls) {
                const controlId = controlByCode.get(control.code);
                if (!controlId)
                    continue;
                control.accounts.forEach((account, index) => {
                    accountRows.push({
                        code: `${control.code}${String(index + 1).padStart(4, '0')}`,
                        name: account.name,
                        control_id: controlId,
                        system_key: account.systemKey ?? null,
                        is_system: Boolean(account.systemKey),
                        opening_side: isDebitNature(Number(sub.code[0])) ? 'DEBIT' : 'CREDIT',
                    });
                });
            }
        }
        await client_2.prisma.transactionalAccount.createMany({ data: accountRows, skipDuplicates: true });
    }
    /** Re-creates any missing system control / account (e.g. if a code was taken by a user record). */
    async ensureSystemAccounts() {
        for (const sub of DEFAULT_CHART) {
            for (const control of sub.controls) {
                const needsControl = Boolean(control.systemKey);
                const systemAccounts = control.accounts.filter((a) => a.systemKey);
                if (!needsControl && systemAccounts.length === 0)
                    continue;
                let controlRow = control.systemKey
                    ? await client_2.prisma.controlAccount.findUnique({ where: { system_key: control.systemKey } })
                    : await client_2.prisma.controlAccount.findUnique({ where: { code: control.code } });
                if (!controlRow) {
                    let subRow = await client_2.prisma.accountSubType.findUnique({ where: { code: sub.code } });
                    if (!subRow) {
                        subRow = await client_2.prisma.accountSubType.create({
                            data: { code: sub.code, name: sub.name, type_code: Number(sub.code[0]), is_system: true },
                        });
                    }
                    const code = (await client_2.prisma.controlAccount.findUnique({ where: { code: control.code } }))
                        ? await this.nextControlCode(subRow.id)
                        : control.code;
                    controlRow = await client_2.prisma.controlAccount.create({
                        data: {
                            code,
                            name: control.name,
                            sub_type_id: subRow.id,
                            system_key: control.systemKey ?? null,
                            is_system: Boolean(control.systemKey),
                        },
                    });
                }
                for (const account of systemAccounts) {
                    const found = await client_2.prisma.transactionalAccount.findUnique({ where: { system_key: account.systemKey } });
                    if (found)
                        continue;
                    await client_2.prisma.transactionalAccount.create({
                        data: {
                            code: await this.nextAccountCode(controlRow.id),
                            name: account.name,
                            control_id: controlRow.id,
                            system_key: account.systemKey,
                            is_system: true,
                            opening_side: isDebitNature(Number(sub.code[0])) ? 'DEBIT' : 'CREDIT',
                        },
                    });
                }
            }
        }
    }
    async controlBySystemKey(key) {
        await this.ensureSetup();
        const control = await client_2.prisma.controlAccount.findUnique({ where: { system_key: key } });
        if (!control)
            throw new apiError_1.AppError(500, `System control account ${key} is missing`);
        return control;
    }
    /**
     * Creates the per-record accounts that mirror POS master data:
     *   employees → Payroll Expense (522xxxx "Name Salary")
     *   suppliers → Trade Payables (211xxxx)
     *   expense categories → Expenses Control (521xxxx), or linked to a same-named expense head.
     * Idempotent; cheap when nothing is missing.
     */
    async syncLinkedAccounts() {
        await this.ensureSetup();
        const [employees, suppliers, categories] = await Promise.all([
            client_2.prisma.employee.findMany({
                where: { chart_account: null },
                select: { id: true, name: true, phone_number: true, cnic: true, address: true, email: true },
                orderBy: { created_at: 'asc' },
            }),
            client_2.prisma.supplier.findMany({
                where: { chart_account: null },
                select: {
                    id: true,
                    name: true,
                    mobile_number: true,
                    phone_number: true,
                    address: true,
                    ntn: true,
                    gov_id: true,
                    email: true,
                },
                orderBy: { created_at: 'asc' },
            }),
            client_2.prisma.expenseCategory.findMany({
                where: { chart_account: null },
                select: { id: true, name: true, description: true },
                orderBy: { created_at: 'asc' },
            }),
        ]);
        const created = { employees: 0, suppliers: 0, expenseCategories: 0 };
        if (employees.length === 0 && suppliers.length === 0 && categories.length === 0)
            return created;
        const createLinked = async (controlId, data) => {
            // Retry on code collisions caused by concurrent syncs.
            for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                    await client_2.prisma.transactionalAccount.create({
                        data: { ...data, control_id: controlId, code: await this.nextAccountCode(controlId) },
                    });
                    return true;
                }
                catch (error) {
                    if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                        const target = String(error.meta?.target ?? '');
                        if (!target.includes('code'))
                            return false; // already linked by a parallel request
                        continue;
                    }
                    throw error;
                }
            }
            return false;
        };
        if (employees.length) {
            const payroll = await this.controlBySystemKey('PAYROLL');
            for (const employee of employees) {
                const ok = await createLinked(payroll.id, {
                    name: `${employee.name} Salary`,
                    employee_id: employee.id,
                    mobile: employee.phone_number,
                    nic: employee.cnic,
                    address: employee.address,
                    email: employee.email,
                    contact_person: employee.name,
                    opening_side: 'DEBIT',
                });
                if (ok)
                    created.employees += 1;
            }
        }
        if (suppliers.length) {
            const payables = await this.controlBySystemKey('TRADE_PAYABLES');
            for (const supplier of suppliers) {
                const ok = await createLinked(payables.id, {
                    name: supplier.name,
                    supplier_id: supplier.id,
                    contact_person: supplier.name,
                    mobile: supplier.mobile_number || supplier.phone_number,
                    address: supplier.address,
                    ntn: supplier.ntn,
                    nic: supplier.gov_id,
                    email: supplier.email,
                    opening_side: 'CREDIT',
                });
                if (ok)
                    created.suppliers += 1;
            }
        }
        if (categories.length) {
            const general = await this.controlBySystemKey('GENERAL_EXPENSES');
            for (const category of categories) {
                // Prefer linking an existing, unlinked expense head with the same name.
                const sameName = await client_2.prisma.transactionalAccount.findFirst({
                    where: {
                        name: { equals: category.name, mode: 'insensitive' },
                        expense_category_id: null,
                        employee_id: null,
                        system_key: null,
                        control: { sub_type: { type_code: 5 } },
                    },
                });
                if (sameName) {
                    await client_2.prisma.transactionalAccount
                        .update({ where: { id: sameName.id }, data: { expense_category_id: category.id } })
                        .catch(() => undefined);
                    created.expenseCategories += 1;
                    continue;
                }
                const ok = await createLinked(general.id, {
                    name: category.name,
                    expense_category_id: category.id,
                    notes: category.description,
                    opening_side: 'DEBIT',
                });
                if (ok)
                    created.expenseCategories += 1;
            }
        }
        return created;
    }
    /* ========================= code helpers ========================= */
    async nextSubTypeCode(typeCode) {
        const rows = await client_2.prisma.accountSubType.findMany({
            where: { code: { startsWith: String(typeCode) } },
            select: { code: true },
        });
        const used = new Set(rows.map((r) => Number(r.code.slice(1))));
        for (let i = 1; i <= 9; i += 1)
            if (!used.has(i))
                return `${typeCode}${i}`;
        throw new apiError_1.AppError(400, `All sub type codes for ${TYPE_NAME.get(typeCode)} (x1–x9) are used`);
    }
    async nextControlCode(subTypeId) {
        const sub = await client_2.prisma.accountSubType.findUnique({ where: { id: subTypeId } });
        if (!sub)
            throw new apiError_1.AppError(404, 'Sub type not found');
        const rows = await client_2.prisma.controlAccount.findMany({
            where: { code: { startsWith: sub.code } },
            select: { code: true },
        });
        const used = new Set(rows.filter((r) => r.code.length === 3).map((r) => Number(r.code.slice(2))));
        for (let i = 1; i <= 9; i += 1)
            if (!used.has(i))
                return `${sub.code}${i}`;
        throw new apiError_1.AppError(400, `All control codes under ${sub.code} (x1–x9) are used`);
    }
    async nextAccountCode(controlId) {
        const control = await client_2.prisma.controlAccount.findUnique({ where: { id: controlId } });
        if (!control)
            throw new apiError_1.AppError(404, 'Control account not found');
        const rows = await client_2.prisma.transactionalAccount.findMany({
            where: { code: { startsWith: control.code } },
            select: { code: true },
        });
        const max = rows
            .filter((r) => r.code.length === 7)
            .reduce((m, r) => Math.max(m, Number(r.code.slice(3)) || 0), 0);
        if (max >= 9999)
            throw new apiError_1.AppError(400, `Control ${control.code} is full (9999 accounts)`);
        return `${control.code}${String(max + 1).padStart(4, '0')}`;
    }
    async nextCodes(params) {
        await this.ensureSetup();
        return {
            subType: params.typeCode ? await this.nextSubTypeCode(params.typeCode) : null,
            control: params.subTypeId ? await this.nextControlCode(params.subTypeId) : null,
            account: params.controlId ? await this.nextAccountCode(params.controlId) : null,
        };
    }
    /* ========================== sub types ========================== */
    async createSubType(data) {
        await this.ensureSetup();
        if (!TYPE_NAME.has(data.type_code))
            throw new apiError_1.AppError(400, 'Invalid account type');
        const code = data.code?.trim() || (await this.nextSubTypeCode(data.type_code));
        if (!/^\d{2}$/.test(code) || Number(code[0]) !== data.type_code || code[1] === '0') {
            throw new apiError_1.AppError(400, `Sub type code must be 2 digits starting with ${data.type_code} (e.g. ${data.type_code}1)`);
        }
        if (await client_2.prisma.accountSubType.findUnique({ where: { code } })) {
            throw new apiError_1.AppError(400, `Sub type code ${code} already exists`);
        }
        return client_2.prisma.accountSubType.create({
            data: { code, name: data.name.trim(), type_code: data.type_code, description: clean(data.description) },
        });
    }
    async updateSubType(id, data) {
        const existing = await client_2.prisma.accountSubType.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Sub type not found');
        if (existing.is_system && data.is_active === false) {
            throw new apiError_1.AppError(400, 'System sub types cannot be deactivated');
        }
        return client_2.prisma.accountSubType.update({
            where: { id },
            data: {
                ...(data.name !== undefined ? { name: data.name.trim() } : {}),
                ...(data.description !== undefined ? { description: clean(data.description) } : {}),
                ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
            },
        });
    }
    async deleteSubType(id) {
        const existing = await client_2.prisma.accountSubType.findUnique({
            where: { id },
            include: { _count: { select: { controls: true } } },
        });
        if (!existing)
            throw new apiError_1.AppError(404, 'Sub type not found');
        if (existing.is_system)
            throw new apiError_1.AppError(400, `"${existing.name}" is a system sub type and cannot be deleted`);
        if (existing._count.controls > 0) {
            throw new apiError_1.AppError(400, `Delete the ${existing._count.controls} control account(s) under "${existing.name}" first`);
        }
        await client_2.prisma.accountSubType.delete({ where: { id } });
        return { id };
    }
    /* ======================= control accounts ======================= */
    async createControl(data) {
        await this.ensureSetup();
        const sub = await client_2.prisma.accountSubType.findUnique({ where: { id: data.sub_type_id } });
        if (!sub)
            throw new apiError_1.AppError(404, 'Sub type not found');
        const code = data.code?.trim() || (await this.nextControlCode(sub.id));
        if (!/^\d{3}$/.test(code) || !code.startsWith(sub.code) || code[2] === '0') {
            throw new apiError_1.AppError(400, `Control code must be 3 digits starting with ${sub.code} (e.g. ${sub.code}1)`);
        }
        if (await client_2.prisma.controlAccount.findUnique({ where: { code } })) {
            throw new apiError_1.AppError(400, `Control code ${code} already exists`);
        }
        return client_2.prisma.controlAccount.create({
            data: { code, name: data.name.trim(), sub_type_id: sub.id, description: clean(data.description) },
        });
    }
    async updateControl(id, data) {
        const existing = await client_2.prisma.controlAccount.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Control account not found');
        if (existing.is_system && data.is_active === false) {
            throw new apiError_1.AppError(400, 'System control accounts cannot be deactivated');
        }
        return client_2.prisma.controlAccount.update({
            where: { id },
            data: {
                ...(data.name !== undefined ? { name: data.name.trim() } : {}),
                ...(data.description !== undefined ? { description: clean(data.description) } : {}),
                ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
            },
        });
    }
    async deleteControl(id) {
        const existing = await client_2.prisma.controlAccount.findUnique({
            where: { id },
            include: { _count: { select: { accounts: true } } },
        });
        if (!existing)
            throw new apiError_1.AppError(404, 'Control account not found');
        if (existing.is_system)
            throw new apiError_1.AppError(400, `"${existing.name}" is a system control account and cannot be deleted`);
        if (existing._count.accounts > 0) {
            throw new apiError_1.AppError(400, `Delete or move the ${existing._count.accounts} account(s) under "${existing.name}" first`);
        }
        await client_2.prisma.controlAccount.delete({ where: { id } });
        return { id };
    }
    /* ==================== transactional accounts ==================== */
    async listAccounts(q) {
        await this.syncLinkedAccounts();
        const where = {};
        if (q.search?.trim()) {
            const s = q.search.trim();
            where.OR = [
                { name: { contains: s, mode: 'insensitive' } },
                { code: { startsWith: s } },
                { contact_person: { contains: s, mode: 'insensitive' } },
                { mobile: { contains: s } },
            ];
        }
        if (q.type_code)
            where.control = { sub_type: { type_code: q.type_code } };
        if (q.control_id)
            where.control_id = q.control_id;
        if (q.active !== undefined)
            where.is_active = q.active;
        const rows = await client_2.prisma.transactionalAccount.findMany({
            where,
            include: ACCOUNT_LIST_INCLUDE,
            orderBy: { code: 'asc' },
        });
        return rows.map((row) => this.serializeAccount(row));
    }
    serializeAccount(row) {
        const typeCode = row.control.sub_type.type_code;
        return {
            id: row.id,
            code: row.code,
            name: row.name,
            control_id: row.control_id,
            control: { id: row.control.id, code: row.control.code, name: row.control.name },
            sub_type: { id: row.control.sub_type.id, code: row.control.sub_type.code, name: row.control.sub_type.name },
            type_code: typeCode,
            type_name: TYPE_NAME.get(typeCode),
            contact_person: row.contact_person,
            mobile: row.mobile,
            address: row.address,
            nic: row.nic,
            ntn: row.ntn,
            email: row.email,
            notes: row.notes,
            opening_balance: (0, helpers_1.asNumber)(row.opening_balance),
            opening_side: row.opening_side,
            is_active: row.is_active,
            is_system: row.is_system,
            system_key: row.system_key,
            computed: Boolean(row.system_key && COMPUTED_KEYS.has(row.system_key)),
            link: row.employee
                ? { kind: 'EMPLOYEE', id: row.employee.id, name: row.employee.name }
                : row.supplier
                    ? { kind: 'SUPPLIER', id: row.supplier.id, name: row.supplier.name }
                    : row.expense_category
                        ? { kind: 'EXPENSE_CATEGORY', id: row.expense_category.id, name: row.expense_category.name }
                        : null,
            created_at: row.created_at,
        };
    }
    async getAccount(id) {
        const row = await client_2.prisma.transactionalAccount.findUnique({ where: { id }, include: ACCOUNT_LIST_INCLUDE });
        if (!row)
            throw new apiError_1.AppError(404, 'Account not found');
        return this.serializeAccount(row);
    }
    async createAccount(data) {
        await this.ensureSetup();
        const control = await client_2.prisma.controlAccount.findUnique({
            where: { id: data.control_id },
            include: { sub_type: true },
        });
        if (!control)
            throw new apiError_1.AppError(404, 'Control account not found');
        const code = data.code?.trim() || (await this.nextAccountCode(control.id));
        if (!/^\d{7}$/.test(code) || !code.startsWith(control.code) || code.endsWith('0000')) {
            throw new apiError_1.AppError(400, `Account code must be 7 digits starting with ${control.code} (e.g. ${control.code}0001)`);
        }
        if (await client_2.prisma.transactionalAccount.findUnique({ where: { code } })) {
            throw new apiError_1.AppError(400, `Account code ${code} already exists`);
        }
        const name = data.name.trim();
        const clash = await client_2.prisma.transactionalAccount.findFirst({
            where: { control_id: control.id, name: { equals: name, mode: 'insensitive' } },
        });
        if (clash)
            throw new apiError_1.AppError(400, `"${name}" already exists under ${control.name} (${clash.code})`);
        const typeCode = control.sub_type.type_code;
        const created = await client_2.prisma.transactionalAccount.create({
            data: {
                code,
                name,
                control_id: control.id,
                contact_person: clean(data.contact_person),
                mobile: clean(data.mobile),
                address: clean(data.address),
                nic: clean(data.nic),
                ntn: clean(data.ntn),
                email: clean(data.email),
                notes: clean(data.notes),
                // Income / expense accounts start every period at zero.
                opening_balance: new client_1.Prisma.Decimal(isProfitLossType(typeCode) ? 0 : Math.abs(data.opening_balance ?? 0)),
                opening_side: data.opening_side ?? (isDebitNature(typeCode) ? 'DEBIT' : 'CREDIT'),
                is_active: data.is_active ?? true,
            },
        });
        return this.getAccount(created.id);
    }
    async updateAccount(id, data) {
        const existing = await client_2.prisma.transactionalAccount.findUnique({
            where: { id },
            include: { control: { include: { sub_type: true } } },
        });
        if (!existing)
            throw new apiError_1.AppError(404, 'Account not found');
        if (existing.is_system && data.is_active === false) {
            throw new apiError_1.AppError(400, 'System accounts cannot be deactivated');
        }
        const patch = {};
        let typeCode = existing.control.sub_type.type_code;
        if (data.control_id && data.control_id !== existing.control_id) {
            if (existing.is_system)
                throw new apiError_1.AppError(400, 'System accounts cannot be moved');
            const target = await client_2.prisma.controlAccount.findUnique({
                where: { id: data.control_id },
                include: { sub_type: true },
            });
            if (!target)
                throw new apiError_1.AppError(404, 'Target control account not found');
            if (target.sub_type.type_code !== typeCode) {
                throw new apiError_1.AppError(400, 'An account can only be moved to a control account of the same type');
            }
            patch.control_id = target.id;
            patch.code = await this.nextAccountCode(target.id);
            typeCode = target.sub_type.type_code;
        }
        if (data.name !== undefined)
            patch.name = data.name.trim();
        if (data.contact_person !== undefined)
            patch.contact_person = clean(data.contact_person);
        if (data.mobile !== undefined)
            patch.mobile = clean(data.mobile);
        if (data.address !== undefined)
            patch.address = clean(data.address);
        if (data.nic !== undefined)
            patch.nic = clean(data.nic);
        if (data.ntn !== undefined)
            patch.ntn = clean(data.ntn);
        if (data.email !== undefined)
            patch.email = clean(data.email);
        if (data.notes !== undefined)
            patch.notes = clean(data.notes);
        if (data.opening_balance !== undefined && !isProfitLossType(typeCode)) {
            patch.opening_balance = new client_1.Prisma.Decimal(Math.abs(data.opening_balance));
        }
        if (data.opening_side !== undefined)
            patch.opening_side = data.opening_side;
        if (data.is_active !== undefined)
            patch.is_active = data.is_active;
        await client_2.prisma.transactionalAccount.update({ where: { id }, data: patch });
        return this.getAccount(id);
    }
    async deleteAccount(id) {
        const existing = await client_2.prisma.transactionalAccount.findUnique({
            where: { id },
            include: { _count: { select: { expenses: true, recurring_expenses: true, journal_lines: true } } },
        });
        if (!existing)
            throw new apiError_1.AppError(404, 'Account not found');
        if (existing.is_system)
            throw new apiError_1.AppError(400, `"${existing.name}" is a system account and cannot be deleted`);
        if (existing.employee_id || existing.supplier_id || existing.expense_category_id) {
            throw new apiError_1.AppError(400, `"${existing.name}" is linked to an employee / supplier / expense category. Deactivate it instead — it is recreated automatically while the record exists.`);
        }
        const used = existing._count.expenses + existing._count.recurring_expenses + existing._count.journal_lines;
        if (used > 0) {
            throw new apiError_1.AppError(400, `"${existing.name}" has ${used} posting(s) (expenses / recurring / journal lines). Deactivate it instead.`);
        }
        await client_2.prisma.transactionalAccount.delete({ where: { id } });
        return { id };
    }
    /* ========================= balances ========================= */
    resolveBranch(params) {
        const isAdmin = ADMIN_ROLES.has(params.userRole || '');
        const branchId = isAdmin ? params.branchId || undefined : params.userBranchId || params.branchId || undefined;
        return branchId;
    }
    resolveWindow(params) {
        const from = params.from || ALL_DATES_FROM;
        const to = params.to || (0, timezone_1.businessTodayYmd)();
        if (to < from)
            throw new apiError_1.AppError(400, 'To date cannot be earlier than from date');
        const { start, end } = (0, timezone_1.localRange)(from, to);
        return { from, to, start, end };
    }
    async loadAccountMeta() {
        const rows = await client_2.prisma.transactionalAccount.findMany({
            select: {
                id: true,
                code: true,
                name: true,
                system_key: true,
                is_active: true,
                opening_balance: true,
                opening_side: true,
                control: { select: { sub_type: { select: { type_code: true } } } },
            },
            orderBy: { code: 'asc' },
        });
        return rows.map((row) => {
            const amount = (0, helpers_1.asNumber)(row.opening_balance);
            return {
                id: row.id,
                code: row.code,
                name: row.name,
                typeCode: row.control.sub_type.type_code,
                systemKey: row.system_key,
                isActive: row.is_active,
                openingSigned: row.opening_side === 'DEBIT' ? amount : -amount,
            };
        });
    }
    /**
     * Gathers postings from every POS module for the window. P&L sources are only
     * fetched for the window itself; balance-sheet sources (suppliers, journals)
     * are fetched up to `end` so opening balances roll forward.
     */
    async collectEntries(opts) {
        const { start, end, branchId, accounts, onlyAccountId } = opts;
        const byId = new Map(accounts.map((a) => [a.id, a]));
        const target = onlyAccountId ? byId.get(onlyAccountId) : undefined;
        const want = (typeCode) => (target ? target.typeCode === typeCode : accounts.some((a) => a.typeCode === typeCode));
        const entries = [];
        const links = await client_2.prisma.transactionalAccount.findMany({
            where: {
                OR: [{ employee_id: { not: null } }, { supplier_id: { not: null } }, { expense_category_id: { not: null } }, { system_key: 'MISC_EXPENSE' }],
            },
            select: { id: true, employee_id: true, supplier_id: true, expense_category_id: true, system_key: true },
        });
        const accountByEmployee = new Map();
        const accountBySupplier = new Map();
        const accountByCategory = new Map();
        let miscAccountId;
        for (const link of links) {
            if (link.employee_id)
                accountByEmployee.set(link.employee_id, link.id);
            if (link.supplier_id)
                accountBySupplier.set(link.supplier_id, link.id);
            if (link.expense_category_id)
                accountByCategory.set(link.expense_category_id, link.id);
            if (link.system_key === 'MISC_EXPENSE')
                miscAccountId = link.id;
        }
        // Opening balances (balance-sheet accounts only)
        for (const account of accounts) {
            if (onlyAccountId && account.id !== onlyAccountId)
                continue;
            if (isProfitLossType(account.typeCode) || Math.abs(account.openingSigned) < 0.005)
                continue;
            entries.push({
                accountId: account.id,
                date: null,
                kind: 'OPENING',
                reference: null,
                description: 'Opening balance',
                debit: account.openingSigned > 0 ? account.openingSigned : 0,
                credit: account.openingSigned < 0 ? -account.openingSigned : 0,
                before: true,
            });
        }
        const tasks = [];
        // Journal vouchers
        tasks.push((async () => {
            const lines = await client_2.prisma.journalVoucherLine.findMany({
                where: {
                    ...(onlyAccountId ? { account_id: onlyAccountId } : {}),
                    voucher: { voucher_date: { lte: end }, ...(branchId ? { branch_id: branchId } : {}) },
                },
                select: {
                    account_id: true,
                    debit: true,
                    credit: true,
                    description: true,
                    voucher: { select: { id: true, voucher_no: true, voucher_date: true, narration: true } },
                },
            });
            for (const line of lines) {
                const account = byId.get(line.account_id);
                if (!account)
                    continue;
                const before = line.voucher.voucher_date < start;
                if (before && isProfitLossType(account.typeCode))
                    continue;
                entries.push({
                    accountId: line.account_id,
                    date: line.voucher.voucher_date,
                    kind: 'JOURNAL',
                    reference: line.voucher.voucher_no,
                    description: line.description || line.voucher.narration || 'Journal voucher',
                    debit: (0, helpers_1.asNumber)(line.debit),
                    credit: (0, helpers_1.asNumber)(line.credit),
                    before,
                    sourceId: line.voucher.id,
                });
            }
        })());
        // Approved expenses → expense heads
        if (want(5)) {
            tasks.push((async () => {
                const rows = await client_2.prisma.expense.findMany({
                    where: {
                        status: 'APPROVED',
                        expense_date: { gte: start, lte: end },
                        ...(branchId ? { branch_id: branchId } : {}),
                    },
                    select: {
                        id: true,
                        particular: true,
                        amount: true,
                        expense_date: true,
                        account_id: true,
                        category_id: true,
                        vendor: true,
                        reference: true,
                        payment_method: true,
                    },
                });
                for (const row of rows) {
                    const accountId = (row.account_id && byId.has(row.account_id) ? row.account_id : undefined) ||
                        (row.category_id ? accountByCategory.get(row.category_id) : undefined) ||
                        miscAccountId;
                    if (!accountId || (onlyAccountId && accountId !== onlyAccountId))
                        continue;
                    const amount = Math.abs((0, helpers_1.asNumber)(row.amount));
                    entries.push({
                        accountId,
                        date: row.expense_date,
                        kind: 'EXPENSE',
                        reference: row.reference,
                        description: [row.particular, row.vendor ? `· ${row.vendor}` : null, `(${row.payment_method})`]
                            .filter(Boolean)
                            .join(' '),
                        debit: amount,
                        credit: 0,
                        before: false,
                        sourceId: row.id,
                    });
                }
            })());
            // Paid salaries & commissions → each employee's salary account (cash basis, matches P&L)
            const employeeFilter = branchId ? { employee: { branch_id: branchId } } : {};
            tasks.push((async () => {
                const [salaries, commissions] = await Promise.all([
                    client_2.prisma.salary.findMany({
                        where: { is_paid: true, paid_date: { gte: start, lte: end }, ...employeeFilter },
                        select: { id: true, employee_id: true, month: true, year: true, amount: true, bonus: true, allowances: true, deductions: true, loan_amount: true, paid_date: true },
                    }),
                    client_2.prisma.commission.findMany({
                        where: { is_paid: true, paid_date: { gte: start, lte: end }, ...employeeFilter },
                        select: { id: true, employee_id: true, month: true, year: true, amount: true, paid_date: true, sales_amount: true },
                    }),
                ]);
                for (const row of salaries) {
                    const accountId = accountByEmployee.get(row.employee_id);
                    if (!accountId || (onlyAccountId && accountId !== onlyAccountId))
                        continue;
                    const loan = (0, helpers_1.asNumber)(row.loan_amount);
                    entries.push({
                        accountId,
                        date: row.paid_date,
                        kind: 'SALARY',
                        reference: `SAL-${row.year}-${String(row.month).padStart(2, '0')}`,
                        description: `Salary ${monthLabel(row.month, row.year)}${loan > 0 ? ` (loan/advance ${loan.toLocaleString('en-US')})` : ''}`,
                        debit: Math.abs((0, helpers_1.asNumber)(row.amount) + (0, helpers_1.asNumber)(row.bonus) + (0, helpers_1.asNumber)(row.allowances) - (0, helpers_1.asNumber)(row.deductions)),
                        credit: 0,
                        before: false,
                        sourceId: row.id,
                    });
                }
                for (const row of commissions) {
                    const accountId = accountByEmployee.get(row.employee_id);
                    if (!accountId || (onlyAccountId && accountId !== onlyAccountId))
                        continue;
                    entries.push({
                        accountId,
                        date: row.paid_date,
                        kind: 'COMMISSION',
                        reference: `COM-${row.year}-${String(row.month).padStart(2, '0')}`,
                        description: `Commission ${monthLabel(row.month, row.year)} on sales ${(0, helpers_1.asNumber)(row.sales_amount).toLocaleString('en-US')}`,
                        debit: Math.abs((0, helpers_1.asNumber)(row.amount)),
                        credit: 0,
                        before: false,
                        sourceId: row.id,
                    });
                }
            })());
        }
        // Supplier invoices (credit) and invoice-linked payments (debit) — mirrors Balance Sheet payables
        if (want(2)) {
            const supplierFilter = onlyAccountId && target
                ? [...accountBySupplier.entries()].filter(([, accId]) => accId === onlyAccountId).map(([supId]) => supId)
                : null;
            if (!supplierFilter || supplierFilter.length > 0) {
                tasks.push((async () => {
                    const [invoices, payments] = await Promise.all([
                        client_2.prisma.purchaseInvoice.findMany({
                            where: {
                                invoice_date: { lte: end },
                                ...(branchId ? { branch_id: branchId } : {}),
                                ...(supplierFilter ? { supplier_id: { in: supplierFilter } } : {}),
                            },
                            select: { id: true, supplier_id: true, invoice_number: true, invoice_date: true, total_amount: true, notes: true },
                        }),
                        client_2.prisma.supplierPayment.findMany({
                            where: {
                                payment_date: { lte: end },
                                purchase_invoice_id: { not: null },
                                ...(branchId ? { purchase_invoice: { branch_id: branchId } } : {}),
                                ...(supplierFilter ? { supplier_id: { in: supplierFilter } } : {}),
                            },
                            select: {
                                id: true,
                                supplier_id: true,
                                amount: true,
                                payment_date: true,
                                method: true,
                                reference: true,
                                purchase_invoice: { select: { invoice_number: true } },
                            },
                        }),
                    ]);
                    for (const row of invoices) {
                        const accountId = accountBySupplier.get(row.supplier_id);
                        if (!accountId)
                            continue;
                        entries.push({
                            accountId,
                            date: row.invoice_date,
                            kind: 'PURCHASE_INVOICE',
                            reference: row.invoice_number,
                            description: `Purchase invoice ${row.invoice_number}`,
                            debit: 0,
                            credit: (0, helpers_1.asNumber)(row.total_amount),
                            before: row.invoice_date < start,
                            sourceId: row.id,
                        });
                    }
                    for (const row of payments) {
                        const accountId = accountBySupplier.get(row.supplier_id);
                        if (!accountId)
                            continue;
                        entries.push({
                            accountId,
                            date: row.payment_date,
                            kind: 'SUPPLIER_PAYMENT',
                            reference: row.reference || row.purchase_invoice?.invoice_number || null,
                            description: `Payment (${row.method})${row.purchase_invoice ? ` against ${row.purchase_invoice.invoice_number}` : ''}`,
                            debit: (0, helpers_1.asNumber)(row.amount),
                            credit: 0,
                            before: row.payment_date < start,
                            sourceId: row.id,
                        });
                    }
                })());
            }
        }
        await Promise.all(tasks);
        // Only keep postings for the accounts the caller asked about.
        return entries.filter((entry) => byId.has(entry.accountId));
    }
    /** Signed (debit-positive) values for system accounts read from the existing reports. */
    async computedBalances(params, keys) {
        const out = new Map();
        if (keys.size === 0)
            return out;
        const needSheet = ['CASH', 'INVENTORY', 'RECEIVABLES', 'CUSTOMER_CREDITS'].some((k) => keys.has(k));
        const needStatement = ['SALES', 'SALES_DISCOUNTS', 'SALES_RETURNS', 'COGS'].some((k) => keys.has(k));
        const base = {
            from: params.from,
            to: params.to,
            branchId: params.branchId,
            userRole: params.userRole,
            userBranchId: params.userBranchId,
        };
        const [sheet, statement] = await Promise.all([
            needSheet ? this.balanceSheet.sheet(base) : Promise.resolve(null),
            needStatement
                ? this.financialStatement.statement({ ...base, includeSalaries: false, includePurchases: false, comparePrevious: false })
                : Promise.resolve(null),
        ]);
        if (sheet) {
            out.set('CASH', sheet.assets.cashOnHand);
            out.set('INVENTORY', sheet.assets.inventory);
            out.set('RECEIVABLES', sheet.assets.accountsReceivable);
            out.set('CUSTOMER_CREDITS', -sheet.liabilities.customerCredits);
        }
        if (statement) {
            out.set('SALES', -statement.income.grossSales);
            out.set('SALES_DISCOUNTS', statement.income.discounts);
            out.set('SALES_RETURNS', statement.income.returns);
            out.set('COGS', statement.cogs.soldCost);
        }
        return out;
    }
    async computeBalances(params) {
        const window = this.resolveWindow(params);
        const branchId = this.resolveBranch(params);
        const accounts = await this.loadAccountMeta();
        const entries = await this.collectEntries({ start: window.start, end: window.end, branchId, accounts });
        const balances = new Map();
        for (const account of accounts)
            balances.set(account.id, { opening: 0, debit: 0, credit: 0, closing: 0, entries: 0 });
        for (const entry of entries) {
            const balance = balances.get(entry.accountId);
            if (!balance)
                continue;
            if (entry.before) {
                balance.opening += entry.debit - entry.credit;
            }
            else {
                balance.debit += entry.debit;
                balance.credit += entry.credit;
                balance.entries += 1;
            }
        }
        const computedKeys = new Set(accounts.map((a) => a.systemKey).filter((k) => !!k && COMPUTED_KEYS.has(k)));
        const computed = await this.computedBalances({ ...params, ...window, branchId }, computedKeys);
        for (const account of accounts) {
            if (!account.systemKey || !computed.has(account.systemKey))
                continue;
            const value = computed.get(account.systemKey) || 0;
            const balance = balances.get(account.id);
            if (value > 0)
                balance.debit += value;
            else
                balance.credit += -value;
            balance.entries += 1;
        }
        for (const balance of balances.values()) {
            balance.opening = round2(balance.opening);
            balance.debit = round2(balance.debit);
            balance.credit = round2(balance.credit);
            balance.closing = round2(balance.opening + balance.debit - balance.credit);
        }
        return { window, branchId, accounts, balances, computedValues: computed };
    }
    /* ============================ tree ============================ */
    async tree(params) {
        await this.syncLinkedAccounts();
        const [subTypes, controls, accounts, branches, computedResult] = await Promise.all([
            client_2.prisma.accountSubType.findMany({ orderBy: { code: 'asc' } }),
            client_2.prisma.controlAccount.findMany({ orderBy: { code: 'asc' } }),
            client_2.prisma.transactionalAccount.findMany({ include: ACCOUNT_LIST_INCLUDE, orderBy: { code: 'asc' } }),
            client_2.prisma.branch.findMany({ where: { is_active: true }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }),
            this.computeBalances(params),
        ]);
        const { balances, window, branchId } = computedResult;
        const zero = () => ({ opening: 0, debit: 0, credit: 0, closing: 0 });
        const add = (target, b) => {
            target.opening = round2(target.opening + b.opening);
            target.debit = round2(target.debit + b.debit);
            target.credit = round2(target.credit + b.credit);
            target.closing = round2(target.closing + b.closing);
        };
        const accountsByControl = new Map();
        for (const row of accounts) {
            if (!params.includeInactive && !row.is_active)
                continue;
            const list = accountsByControl.get(row.control_id) || [];
            list.push(this.serializeAccount(row));
            accountsByControl.set(row.control_id, list);
        }
        const controlsBySub = new Map();
        for (const control of controls) {
            if (!params.includeInactive && !control.is_active)
                continue;
            const list = controlsBySub.get(control.sub_type_id) || [];
            list.push(control);
            controlsBySub.set(control.sub_type_id, list);
        }
        const types = exports.ACCOUNT_TYPES.map((type) => {
            const typeTotals = zero();
            const subs = subTypes
                .filter((s) => s.type_code === type.code && (params.includeInactive || s.is_active))
                .map((sub) => {
                const subTotals = zero();
                const ctrl = (controlsBySub.get(sub.id) || []).map((control) => {
                    const controlTotals = zero();
                    const accs = (accountsByControl.get(control.id) || []).map((account) => {
                        const balance = balances.get(account.id) || { opening: 0, debit: 0, credit: 0, closing: 0, entries: 0 };
                        add(controlTotals, balance);
                        return {
                            ...account,
                            balance: {
                                opening: balance.opening,
                                debit: balance.debit,
                                credit: balance.credit,
                                closing: balance.closing,
                                entries: balance.entries,
                            },
                            computed_source: account.system_key ? COMPUTED_SOURCE[account.system_key] || null : null,
                        };
                    });
                    add(subTotals, controlTotals);
                    return {
                        id: control.id,
                        code: control.code,
                        name: control.name,
                        description: control.description,
                        is_active: control.is_active,
                        is_system: control.is_system,
                        system_key: control.system_key,
                        sub_type_id: control.sub_type_id,
                        totals: controlTotals,
                        accounts: accs,
                    };
                });
                add(typeTotals, subTotals);
                return {
                    id: sub.id,
                    code: sub.code,
                    name: sub.name,
                    description: sub.description,
                    type_code: sub.type_code,
                    is_active: sub.is_active,
                    is_system: sub.is_system,
                    totals: subTotals,
                    controls: ctrl,
                };
            });
            return { code: type.code, name: type.name, nature: type.nature, totals: typeTotals, subTypes: subs };
        });
        const typeTotal = (code) => types.find((t) => t.code === code).totals.closing;
        const income = round2(-typeTotal(4));
        const expense = round2(typeTotal(5));
        return {
            period: { from: window.from, to: window.to },
            branchId: branchId || null,
            branches,
            types,
            summary: {
                assets: round2(typeTotal(1)),
                liabilities: round2(-typeTotal(2)),
                equity: round2(-typeTotal(3)),
                income,
                expenses: expense,
                netProfit: round2(income - expense),
                accountCount: accounts.filter((a) => params.includeInactive || a.is_active).length,
                controlCount: controls.length,
                subTypeCount: subTypes.length,
            },
        };
    }
    /* =========================== ledger =========================== */
    async ledger(accountId, params) {
        await this.ensureSetup();
        const account = await this.getAccount(accountId);
        const window = this.resolveWindow(params);
        const branchId = this.resolveBranch(params);
        const accounts = await this.loadAccountMeta();
        const entries = await this.collectEntries({
            start: window.start,
            end: window.end,
            branchId,
            accounts,
            onlyAccountId: accountId,
        });
        if (account.system_key && COMPUTED_KEYS.has(account.system_key)) {
            const computed = await this.computedBalances({ ...params, ...window, branchId }, new Set([account.system_key]));
            const value = computed.get(account.system_key) || 0;
            entries.push({
                accountId,
                date: window.end,
                kind: 'COMPUTED',
                reference: null,
                description: `${COMPUTED_SOURCE[account.system_key]} · ${isProfitLossType(account.type_code) ? 'period total' : `as of ${window.to}`}`,
                debit: value > 0 ? round2(value) : 0,
                credit: value < 0 ? round2(-value) : 0,
                before: false,
            });
        }
        const opening = round2(entries.filter((e) => e.before).reduce((s, e) => s + e.debit - e.credit, 0));
        const rows = entries
            .filter((e) => !e.before)
            .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
        let running = opening;
        const lines = rows.map((row) => {
            running = round2(running + row.debit - row.credit);
            return {
                date: row.date ? (0, timezone_1.toBusinessYmd)(row.date) : null,
                kind: row.kind,
                reference: row.reference,
                description: row.description,
                debit: round2(row.debit),
                credit: round2(row.credit),
                balance: running,
                source_id: row.sourceId ?? null,
            };
        });
        const debit = round2(rows.reduce((s, r) => s + r.debit, 0));
        const credit = round2(rows.reduce((s, r) => s + r.credit, 0));
        const byKind = new Map();
        for (const row of rows) {
            const entry = byKind.get(row.kind) || { kind: row.kind, count: 0, debit: 0, credit: 0 };
            entry.count += 1;
            entry.debit = round2(entry.debit + row.debit);
            entry.credit = round2(entry.credit + row.credit);
            byKind.set(row.kind, entry);
        }
        return {
            account,
            period: { from: window.from, to: window.to },
            branchId: branchId || null,
            opening,
            debit,
            credit,
            closing: round2(opening + debit - credit),
            natural: isDebitNature(account.type_code) ? 'DEBIT' : 'CREDIT',
            lines,
            byKind: [...byKind.values()],
        };
    }
    /* ====================== expense breakdown ====================== */
    async expenseBreakdown(params) {
        await this.syncLinkedAccounts();
        const window = this.resolveWindow(params);
        const branchId = this.resolveBranch(params);
        const [accounts, structure] = await Promise.all([
            this.loadAccountMeta(),
            client_2.prisma.accountSubType.findMany({
                where: { type_code: 5 },
                orderBy: { code: 'asc' },
                include: {
                    controls: {
                        orderBy: { code: 'asc' },
                        include: {
                            accounts: {
                                orderBy: { code: 'asc' },
                                select: { id: true, code: true, name: true, is_active: true, employee_id: true, expense_category_id: true, system_key: true },
                            },
                        },
                    },
                },
            }),
        ]);
        const expenseAccounts = accounts.filter((a) => a.typeCode === 5);
        const entries = (await this.collectEntries({ start: window.start, end: window.end, branchId, accounts: expenseAccounts })).filter((e) => !e.before);
        const computedKeys = new Set(expenseAccounts.map((a) => a.systemKey).filter((k) => !!k && COMPUTED_KEYS.has(k)));
        const computed = await this.computedBalances({ ...params, ...window, branchId }, computedKeys);
        for (const account of expenseAccounts) {
            if (account.systemKey && computed.has(account.systemKey)) {
                const value = computed.get(account.systemKey) || 0;
                entries.push({
                    accountId: account.id,
                    date: window.end,
                    kind: 'COMPUTED',
                    reference: null,
                    description: COMPUTED_SOURCE[account.systemKey] || 'Computed',
                    debit: value > 0 ? value : 0,
                    credit: value < 0 ? -value : 0,
                    before: false,
                });
            }
        }
        const amountByAccount = new Map();
        const monthly = new Map(); // month -> controlId -> amount
        const daily = new Map(); // YYYY-MM-DD -> amount
        const controlOfAccount = new Map();
        for (const sub of structure)
            for (const c of sub.controls)
                for (const a of c.accounts)
                    controlOfAccount.set(a.id, c.id);
        for (const entry of entries) {
            const net = entry.debit - entry.credit;
            const current = amountByAccount.get(entry.accountId) || { amount: 0, count: 0 };
            current.amount += net;
            current.count += 1;
            amountByAccount.set(entry.accountId, current);
            if (entry.kind !== 'COMPUTED' && entry.date) {
                const day = (0, timezone_1.toBusinessYmd)(entry.date);
                daily.set(day, (daily.get(day) || 0) + net);
                const month = day.slice(0, 7);
                const controlId = controlOfAccount.get(entry.accountId);
                if (!controlId)
                    continue;
                const bucket = monthly.get(month) || new Map();
                bucket.set(controlId, (bucket.get(controlId) || 0) + net);
                monthly.set(month, bucket);
            }
        }
        const total = round2([...amountByAccount.values()].reduce((s, v) => s + v.amount, 0));
        const pct = (value) => (total > 0 ? round2((value / total) * 100) : 0);
        const subTypes = structure.map((sub) => {
            const controls = sub.controls.map((control) => {
                const accs = control.accounts
                    .map((account) => {
                    const value = amountByAccount.get(account.id) || { amount: 0, count: 0 };
                    return {
                        id: account.id,
                        code: account.code,
                        name: account.name,
                        is_active: account.is_active,
                        linked: account.employee_id ? 'EMPLOYEE' : account.expense_category_id ? 'EXPENSE_CATEGORY' : account.system_key ? 'SYSTEM' : null,
                        amount: round2(value.amount),
                        entries: value.count,
                        percent: pct(value.amount),
                    };
                })
                    .filter((a) => a.is_active || Math.abs(a.amount) > 0.005);
                const amount = round2(accs.reduce((s, a) => s + a.amount, 0));
                return {
                    id: control.id,
                    code: control.code,
                    name: control.name,
                    amount,
                    percent: pct(amount),
                    entries: accs.reduce((s, a) => s + a.entries, 0),
                    accounts: accs.sort((a, b) => b.amount - a.amount || a.code.localeCompare(b.code)),
                };
            });
            const amount = round2(controls.reduce((s, c) => s + c.amount, 0));
            return { id: sub.id, code: sub.code, name: sub.name, amount, percent: pct(amount), controls };
        });
        const controlNames = new Map();
        for (const sub of structure)
            for (const c of sub.controls)
                controlNames.set(c.id, `${c.code} ${c.name}`);
        return {
            period: { from: window.from, to: window.to },
            branchId: branchId || null,
            total,
            subTypes,
            topAccounts: subTypes
                .flatMap((s) => s.controls.flatMap((c) => c.accounts.map((a) => ({ ...a, control: c.name }))))
                .filter((a) => a.amount > 0.005)
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 10),
            daily: [...daily.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, amount]) => ({ date, amount: round2(amount) })),
            monthly: [...monthly.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([month, bucket]) => ({
                month,
                total: round2([...bucket.values()].reduce((s, v) => s + v, 0)),
                byControl: [...bucket.entries()].map(([id, amount]) => ({ id, name: controlNames.get(id) || id, amount: round2(amount) })),
            })),
        };
    }
    /* ======================== trial balance ======================== */
    async trialBalance(params) {
        await this.syncLinkedAccounts();
        const { window, branchId, accounts, balances } = await this.computeBalances(params);
        const subTypes = await client_2.prisma.accountSubType.findMany({ select: { code: true, name: true } });
        const controls = await client_2.prisma.controlAccount.findMany({ select: { code: true, name: true } });
        const subName = new Map(subTypes.map((s) => [s.code, s.name]));
        const controlName = new Map(controls.map((c) => [c.code, c.name]));
        const rows = accounts
            .map((account) => {
            const balance = balances.get(account.id);
            return {
                id: account.id,
                code: account.code,
                name: account.name,
                type_code: account.typeCode,
                type_name: TYPE_NAME.get(account.typeCode),
                sub_type: subName.get(account.code.slice(0, 2)) || null,
                control: controlName.get(account.code.slice(0, 3)) || null,
                debit: balance.closing > 0 ? balance.closing : 0,
                credit: balance.closing < 0 ? -balance.closing : 0,
            };
        })
            .filter((row) => row.debit > 0.005 || row.credit > 0.005);
        let debit = round2(rows.reduce((s, r) => s + r.debit, 0));
        let credit = round2(rows.reduce((s, r) => s + r.credit, 0));
        const difference = round2(debit - credit);
        let balancing = null;
        if (Math.abs(difference) >= 0.005) {
            balancing = difference > 0 ? { debit: 0, credit: difference } : { debit: -difference, credit: 0 };
            debit = round2(debit + balancing.debit);
            credit = round2(credit + balancing.credit);
        }
        return {
            period: { from: window.from, to: window.to },
            branchId: branchId || null,
            rows,
            balancing: balancing
                ? {
                    label: "Owner's equity / unposted difference",
                    note: 'Cash, stock, receivables and sales come from POS reports while the opposite postings are not journalised, so the difference is shown here (same method as the Trial Balance report).',
                    ...balancing,
                }
                : null,
            totals: { debit, credit, balanced: Math.abs(debit - credit) < 0.02, rawDifference: difference },
        };
    }
    /* ======================= journal vouchers ======================= */
    async nextVoucherNo(tx) {
        const last = await tx.journalVoucher.findFirst({
            where: { voucher_no: { startsWith: 'JV-' } },
            orderBy: { voucher_no: 'desc' },
            select: { voucher_no: true },
        });
        const n = last ? Number(last.voucher_no.slice(3)) || 0 : 0;
        return `JV-${String(n + 1).padStart(6, '0')}`;
    }
    async validateLines(lines) {
        if (lines.length < 2)
            throw new apiError_1.AppError(400, 'A journal voucher needs at least two lines');
        const ids = [...new Set(lines.map((l) => l.account_id))];
        const found = await client_2.prisma.transactionalAccount.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, code: true, is_active: true, system_key: true },
        });
        const byId = new Map(found.map((a) => [a.id, a]));
        let debit = 0;
        let credit = 0;
        const normalized = lines.map((line, index) => {
            const account = byId.get(line.account_id);
            if (!account)
                throw new apiError_1.AppError(400, `Line ${index + 1}: account not found`);
            if (!account.is_active)
                throw new apiError_1.AppError(400, `Line ${index + 1}: ${account.code} ${account.name} is inactive`);
            const d = round2(Math.max(0, Number(line.debit) || 0));
            const c = round2(Math.max(0, Number(line.credit) || 0));
            if ((d > 0 && c > 0) || (d === 0 && c === 0)) {
                throw new apiError_1.AppError(400, `Line ${index + 1}: enter either a debit or a credit amount`);
            }
            debit += d;
            credit += c;
            return { account_id: line.account_id, debit: new client_1.Prisma.Decimal(d), credit: new client_1.Prisma.Decimal(c), description: line.description?.trim() || null };
        });
        debit = round2(debit);
        credit = round2(credit);
        if (Math.abs(debit - credit) >= 0.005) {
            throw new apiError_1.AppError(400, `Voucher is not balanced — debit ${debit.toFixed(2)} vs credit ${credit.toFixed(2)}`);
        }
        return { lines: normalized, total: debit };
    }
    async listVouchers(q) {
        const page = Math.max(1, q.page || 1);
        const limit = Math.min(200, Math.max(1, q.limit || 25));
        const where = {};
        if (q.from || q.to) {
            const { start, end } = (0, timezone_1.localRange)(q.from || ALL_DATES_FROM, q.to || (0, timezone_1.businessTodayYmd)());
            where.voucher_date = { gte: start, lte: end };
        }
        if (q.search?.trim()) {
            const s = q.search.trim();
            where.OR = [
                { voucher_no: { contains: s, mode: 'insensitive' } },
                { narration: { contains: s, mode: 'insensitive' } },
                { reference: { contains: s, mode: 'insensitive' } },
            ];
        }
        if (q.account_id)
            where.lines = { some: { account_id: q.account_id } };
        const [rows, total] = await Promise.all([
            client_2.prisma.journalVoucher.findMany({
                where,
                include: { lines: { include: { account: { select: { id: true, code: true, name: true } } } } },
                orderBy: [{ voucher_date: 'desc' }, { voucher_no: 'desc' }],
                skip: (page - 1) * limit,
                take: limit,
            }),
            client_2.prisma.journalVoucher.count({ where }),
        ]);
        return {
            data: rows.map((row) => this.serializeVoucher(row)),
            meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
        };
    }
    serializeVoucher(row) {
        return {
            id: row.id,
            voucher_no: row.voucher_no,
            voucher_date: (0, timezone_1.toBusinessYmd)(row.voucher_date),
            narration: row.narration,
            reference: row.reference,
            branch_id: row.branch_id,
            total: (0, helpers_1.asNumber)(row.total),
            created_by: row.created_by,
            created_at: row.created_at,
            lines: row.lines.map((line) => ({
                id: line.id,
                account_id: line.account_id,
                account: line.account,
                description: line.description,
                debit: (0, helpers_1.asNumber)(line.debit),
                credit: (0, helpers_1.asNumber)(line.credit),
            })),
        };
    }
    async getVoucher(id) {
        const row = await client_2.prisma.journalVoucher.findUnique({
            where: { id },
            include: { lines: { include: { account: { select: { id: true, code: true, name: true } } } } },
        });
        if (!row)
            throw new apiError_1.AppError(404, 'Journal voucher not found');
        return this.serializeVoucher(row);
    }
    async createVoucher(data, userId) {
        await this.ensureSetup();
        const { lines, total } = await this.validateLines(data.lines);
        const voucherDate = data.voucher_date ? (0, timezone_1.localRange)(data.voucher_date.slice(0, 10), data.voucher_date.slice(0, 10)).start : new Date();
        await (0, period_lock_service_1.assertPeriodOpen)(data.voucher_date ? data.voucher_date.slice(0, 10) : voucherDate, 'a journal voucher');
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                const created = await client_2.prisma.$transaction(async (tx) => {
                    const voucher_no = await this.nextVoucherNo(tx);
                    return tx.journalVoucher.create({
                        data: {
                            voucher_no,
                            voucher_date: voucherDate,
                            narration: clean(data.narration),
                            reference: clean(data.reference),
                            branch_id: data.branch_id || null,
                            total: new client_1.Prisma.Decimal(total),
                            created_by: userId ?? null,
                            lines: { create: lines },
                        },
                    });
                });
                return this.getVoucher(created.id);
            }
            catch (error) {
                if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 2)
                    continue;
                throw error;
            }
        }
        throw new apiError_1.AppError(500, 'Could not allocate a voucher number');
    }
    async updateVoucher(id, data) {
        const existing = await client_2.prisma.journalVoucher.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Journal voucher not found');
        await (0, period_lock_service_1.assertPeriodOpen)(existing.voucher_date, 'a journal voucher');
        if (data.voucher_date)
            await (0, period_lock_service_1.assertPeriodOpen)(data.voucher_date.slice(0, 10), 'a journal voucher');
        const validated = data.lines ? await this.validateLines(data.lines) : null;
        await client_2.prisma.$transaction(async (tx) => {
            if (validated) {
                await tx.journalVoucherLine.deleteMany({ where: { voucher_id: id } });
                await tx.journalVoucherLine.createMany({ data: validated.lines.map((line) => ({ ...line, voucher_id: id })) });
            }
            await tx.journalVoucher.update({
                where: { id },
                data: {
                    ...(data.voucher_date
                        ? { voucher_date: (0, timezone_1.localRange)(data.voucher_date.slice(0, 10), data.voucher_date.slice(0, 10)).start }
                        : {}),
                    ...(data.narration !== undefined ? { narration: clean(data.narration) } : {}),
                    ...(data.reference !== undefined ? { reference: clean(data.reference) } : {}),
                    ...(data.branch_id !== undefined ? { branch_id: data.branch_id || null } : {}),
                    ...(validated ? { total: new client_1.Prisma.Decimal(validated.total) } : {}),
                },
            });
        });
        return this.getVoucher(id);
    }
    async deleteVoucher(id) {
        const existing = await client_2.prisma.journalVoucher.findUnique({ where: { id } });
        if (!existing)
            throw new apiError_1.AppError(404, 'Journal voucher not found');
        await (0, period_lock_service_1.assertPeriodOpen)(existing.voucher_date, 'a journal voucher');
        await client_2.prisma.journalVoucher.delete({ where: { id } });
        return { id, voucher_no: existing.voucher_no };
    }
    /* ===================== expense integration ===================== */
    /** Validates that an account can receive an expense posting (type 5, active). */
    async assertExpenseAccount(accountId) {
        const account = await client_2.prisma.transactionalAccount.findUnique({
            where: { id: accountId },
            include: { control: { include: { sub_type: true } } },
        });
        if (!account)
            throw new apiError_1.AppError(400, 'Expense account not found in Chart of Accounts');
        if (account.control.sub_type.type_code !== 5) {
            throw new apiError_1.AppError(400, `${account.code} ${account.name} is not an expense account`);
        }
        if (account.system_key && COMPUTED_KEYS.has(account.system_key)) {
            throw new apiError_1.AppError(400, `${account.name} is calculated automatically and cannot take manual expenses`);
        }
        if (!account.is_active)
            throw new apiError_1.AppError(400, `${account.code} ${account.name} is inactive`);
        return account;
    }
    /** Expense heads for pickers in the Expenses module. */
    async expenseAccountOptions() {
        await this.syncLinkedAccounts();
        const rows = await client_2.prisma.transactionalAccount.findMany({
            where: {
                is_active: true,
                control: { sub_type: { type_code: 5 } },
                OR: [{ system_key: null }, { system_key: { notIn: [...COMPUTED_KEYS] } }],
            },
            select: {
                id: true,
                code: true,
                name: true,
                expense_category_id: true,
                employee_id: true,
                control: { select: { id: true, code: true, name: true } },
            },
            orderBy: { code: 'asc' },
        });
        return rows;
    }
}
exports.ChartOfAccountsService = ChartOfAccountsService;
//# sourceMappingURL=chart-of-accounts.service.js.map