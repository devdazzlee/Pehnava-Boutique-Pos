export type UserRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "BRANCH_MANAGER"
  | "WAREHOUSE_MANAGER"
  | "PURCHASE_MANAGER"
  | "SUPERVISOR"
  | "CASHIER";

const KNOWN_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "BRANCH_MANAGER",
  "WAREHOUSE_MANAGER",
  "PURCHASE_MANAGER",
  "SUPERVISOR",
  "CASHIER",
];

export const normalizeUserRole = (role?: string | null): UserRole | null => {
  if (!role) {
    return null;
  }

  return KNOWN_ROLES.includes(role as UserRole) ? (role as UserRole) : null;
};

export const getDefaultDashboardTab = (role?: string | null): string => {
  const normalizedRole = normalizeUserRole(role);

  if (
    normalizedRole === "WAREHOUSE_MANAGER" ||
    normalizedRole === "PURCHASE_MANAGER"
  ) {
    return "inventory-dashboard";
  }

  if (normalizedRole === "CASHIER") {
    return "new-sale";
  }

  return "dashboard";
};
