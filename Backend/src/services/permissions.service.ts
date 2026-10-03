import { Role } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';

/* ============================================================
 * Role permissions. SUPER_ADMIN always has everything; every other
 * role starts from DEFAULTS and can be adjusted in Users & Permissions.
 * ============================================================ */

export type PermissionDef = { key: string; label: string; group: string; description: string };

export const PERMISSIONS: PermissionDef[] = [
  // Sales
  { key: 'sales.discount', group: 'Sales', label: 'Give discounts', description: 'Apply a bill discount at checkout' },
  { key: 'sales.credit', group: 'Sales', label: 'Sell on credit', description: 'Leave a balance on the customer account' },
  { key: 'sales.refund', group: 'Sales', label: 'Returns & exchanges', description: 'Process returns, exchanges and refunds' },
  { key: 'sales.edit', group: 'Sales', label: 'Edit completed bills', description: 'Change items, prices, customer or payment on a saved bill' },
  { key: 'sales.void', group: 'Sales', label: 'Void bills', description: 'Cancel a bill and put its items back in stock' },
  { key: 'sales.delete', group: 'Sales', label: 'Delete bills', description: 'Permanently delete a bill' },
  // Cash register
  { key: 'register.operate', group: 'Cash register', label: 'Open / close register', description: 'Open the till with a cash count and close it' },
  { key: 'register.paid_out', group: 'Cash register', label: 'Cash out (paid out)', description: 'Take cash out of the drawer for expenses' },
  { key: 'register.cash_in', group: 'Cash register', label: 'Cash in', description: 'Add cash to the drawer (float, change)' },
  { key: 'register.approve_variance', group: 'Cash register', label: 'Approve cash differences', description: 'Accept a shortage / overage at closing or handover' },
  { key: 'register.reopen', group: 'Cash register', label: 'Reopen closed register', description: 'Reopen a register that was already closed' },
  // Inventory & products
  { key: 'inventory.adjust', group: 'Inventory', label: 'Stock adjustments', description: 'Adjust stock quantities with a reason' },
  { key: 'products.price_change', group: 'Inventory', label: 'Change prices', description: 'Edit cost price, sale price or product discount' },
  // Money
  { key: 'expenses.approve', group: 'Expenses & accounts', label: 'Approve expenses', description: 'Approve or reject expenses' },
  { key: 'customers.adjust', group: 'Expenses & accounts', label: 'Customer adjustments', description: 'Credit / debit notes, write-offs and refunds on customer accounts' },
  { key: 'payroll.manage', group: 'Expenses & accounts', label: 'Payroll', description: 'Create payslips, pay salaries and give advances' },
  // Reports & admin
  { key: 'reports.financial', group: 'Reports & admin', label: 'Financial reports', description: 'P&L, balance sheet, trial balance, chart of accounts' },
  { key: 'reports.export', group: 'Reports & admin', label: 'Export & print reports', description: 'Download Excel / PDF and print reports' },
  { key: 'audit.view', group: 'Reports & admin', label: 'View audit trail', description: 'See the activity log' },
  { key: 'users.manage', group: 'Reports & admin', label: 'Manage users', description: 'Create users, change roles, reset passwords' },
  { key: 'period.manage', group: 'Reports & admin', label: 'Lock / reopen periods', description: 'Close accounting periods and reopen them' },
];

export const ROLES: { role: Role; label: string; description: string }[] = [
  { role: 'SUPER_ADMIN', label: 'Owner / Super admin', description: 'Full access, cannot be restricted' },
  { role: 'ADMIN', label: 'Admin', description: 'Runs the business day to day' },
  { role: 'BRANCH_MANAGER', label: 'Branch manager', description: 'Manages a branch, approves exceptions' },
  { role: 'SUPERVISOR', label: 'Supervisor', description: 'Floor supervisor, approves cashier exceptions' },
  { role: 'CASHIER', label: 'Cashier', description: 'Rings up sales and runs the till' },
  { role: 'WAREHOUSE_MANAGER', label: 'Warehouse manager', description: 'Stock, transfers and adjustments' },
  { role: 'PURCHASE_MANAGER', label: 'Purchase manager', description: 'Suppliers, purchasing and costs' },
];

const ALL = ['SUPER_ADMIN'] as const;
const DEFAULTS: Record<string, Role[]> = {
  'sales.discount': ['ADMIN', 'BRANCH_MANAGER', 'SUPERVISOR'],
  'sales.credit': ['ADMIN', 'BRANCH_MANAGER', 'SUPERVISOR'],
  'sales.refund': ['ADMIN', 'BRANCH_MANAGER', 'SUPERVISOR'],
  'sales.edit': ['ADMIN', 'BRANCH_MANAGER'],
  'sales.void': ['ADMIN', 'BRANCH_MANAGER'],
  'sales.delete': ['ADMIN'],
  'register.operate': ['ADMIN', 'BRANCH_MANAGER', 'SUPERVISOR', 'CASHIER'],
  'register.paid_out': ['ADMIN', 'BRANCH_MANAGER', 'SUPERVISOR'],
  'register.cash_in': ['ADMIN', 'BRANCH_MANAGER', 'SUPERVISOR'],
  'register.approve_variance': ['ADMIN', 'BRANCH_MANAGER', 'SUPERVISOR'],
  'register.reopen': ['ADMIN'],
  'inventory.adjust': ['ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER'],
  'products.price_change': ['ADMIN', 'PURCHASE_MANAGER'],
  'expenses.approve': ['ADMIN', 'BRANCH_MANAGER'],
  'customers.adjust': ['ADMIN', 'BRANCH_MANAGER'],
  'payroll.manage': ['ADMIN'],
  'reports.financial': ['ADMIN', 'BRANCH_MANAGER'],
  'reports.export': ['ADMIN', 'BRANCH_MANAGER', 'SUPERVISOR', 'WAREHOUSE_MANAGER', 'PURCHASE_MANAGER'],
  'audit.view': ['ADMIN'],
  'users.manage': ['ADMIN'],
  'period.manage': ['ADMIN'],
};

const label = (key: string) => PERMISSIONS.find((p) => p.key === key)?.label ?? key;

let cache: { at: number; overrides: Map<string, boolean> } | null = null;
const TTL_MS = 30_000;

async function overrides() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.overrides;
  const rows = await prisma.rolePermission.findMany();
  const map = new Map(rows.map((r) => [`${r.role}:${r.permission}`, r.allowed]));
  cache = { at: Date.now(), overrides: map };
  return map;
}

export async function can(role: string | undefined | null, key: string): Promise<boolean> {
  if (!role) return false;
  if ((ALL as readonly string[]).includes(role)) return true;
  const map = await overrides();
  const override = map.get(`${role}:${key}`);
  if (override !== undefined) return override;
  return (DEFAULTS[key] ?? []).includes(role as Role);
}

export async function permissionsFor(role: string | undefined | null) {
  const result: Record<string, boolean> = {};
  for (const p of PERMISSIONS) result[p.key] = await can(role, p.key);
  return result;
}

export async function matrix() {
  const map = await overrides();
  return {
    permissions: PERMISSIONS,
    roles: ROLES,
    grants: ROLES.map((r) => ({
      role: r.role,
      locked: r.role === 'SUPER_ADMIN',
      allowed: Object.fromEntries(
        PERMISSIONS.map((p) => {
          if (r.role === 'SUPER_ADMIN') return [p.key, true];
          const o = map.get(`${r.role}:${p.key}`);
          return [p.key, o !== undefined ? o : (DEFAULTS[p.key] ?? []).includes(r.role)];
        }),
      ),
      customized: PERMISSIONS.filter((p) => map.has(`${r.role}:${p.key}`)).map((p) => p.key),
    })),
  };
}

export async function setPermission(role: Role, key: string, allowed: boolean, actorId?: string) {
  if (role === 'SUPER_ADMIN') throw new AppError(400, 'The owner role always has every permission');
  if (!PERMISSIONS.some((p) => p.key === key)) throw new AppError(400, `Unknown permission ${key}`);
  const before = await can(role, key);
  await prisma.rolePermission.upsert({
    where: { role_permission: { role, permission: key } },
    create: { role, permission: key, allowed, updated_by: actorId ?? null },
    update: { allowed, updated_by: actorId ?? null },
  });
  cache = null;
  return { role, key, label: label(key), before, allowed };
}

export async function resetRole(role: Role) {
  await prisma.rolePermission.deleteMany({ where: { role } });
  cache = null;
}

export const permissionLabel = label;
