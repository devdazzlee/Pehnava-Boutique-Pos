"use client";

import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import {
  getDefaultDashboardTab,
  normalizeUserRole,
  type UserRole,
} from "@/lib/role-utils";
import {
  Store,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  BarChart3,
  Scale,
  LogOut,
  History,
  ClipboardList,
  Receipt,
  Wallet,
  BookOpen,
  Banknote,
  UserCheck,
  Truck,
  Grid3X3,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  ArrowLeftRight,
  ArrowRightLeft,
  SlidersHorizontal,
  CreditCard,
  Clock,
  Shield,
  StoreIcon,
  X,
  Warehouse,
  Printer as PrinterIcon,
  Download,
  LineChart,
  Percent,
  Boxes,
  Tags,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  ListTree,
  NotebookPen,
  PieChart,
  Lightbulb,
  Target,
  BookLock,
  BadgePercent,
  Award,
  Gift,
} from "lucide-react";
import { BarcodeScanIcon } from "@/components/icons/barcode-scan-icon";

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN"];
const SALES_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "BRANCH_MANAGER"];
const INVENTORY_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "WAREHOUSE_MANAGER",
  "PURCHASE_MANAGER",
];
const PURCHASE_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "PURCHASE_MANAGER",
];
const TRANSFER_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "WAREHOUSE_MANAGER",
];
const STOCK_OUT_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
];
const BRANCH_DATA_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
];
const STAFF_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "BRANCH_MANAGER",
  "WAREHOUSE_MANAGER",
  "PURCHASE_MANAGER",
];

interface SidebarMenuItem {
  id: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  badge?: string;
  roles?: UserRole[];
}

interface SidebarMenuSection {
  id: string;
  label: string;
  expandable?: boolean;
  items: SidebarMenuItem[];
}

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const menuSections: SidebarMenuSection[] = [
  {
    id: "main",
    label: "Main",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        roles: SALES_ROLES,
      },
      {
        id: "today-revenue",
        label: "Today Revenue",
        icon: Banknote,
        roles: SALES_ROLES,
      },
      {
        id: "today-cash-sales",
        label: "Today Cash Sales",
        icon: Wallet,
        roles: SALES_ROLES,
      },
      {
        id: "today-credit-sales",
        label: "Today Credit Sales",
        icon: CreditCard,
        roles: SALES_ROLES,
      },
      {
        id: "today-expenses",
        label: "Today Expenses",
        icon: Receipt,
        roles: SALES_ROLES,
      },
    ],
  },
  {
    id: "sales",
    label: "Sales & Checkout",
    expandable: true,
    items: [
      { id: "new-sale", label: "Sales", icon: ShoppingCart, roles: SALES_ROLES },
      {
        id: "sales-history",
        label: "Sales History",
        icon: History,
        roles: SALES_ROLES,
      },
      {
        id: "till",
        label: "Cash Register",
        icon: Wallet,
        roles: SALES_ROLES,
      },
      {
        id: "register-report",
        label: "Register Report",
        icon: ClipboardList,
        roles: SALES_ROLES,
      },
      {
        id: "sales-report",
        label: "Sales Report",
        icon: Receipt,
        roles: SALES_ROLES,
      },
      {
        id: "returns",
        label: "Returns",
        icon: RotateCcw,
        roles: SALES_ROLES,
      },
      {
        id: "exchanges",
        label: "Exchanges",
        icon: ArrowLeftRight,
        roles: SALES_ROLES,
      },
      {
        id: "barcode-generator",
        label: "Barcode Generator",
        icon: BarcodeScanIcon,
        roles: SALES_ROLES,
      },
    ],
  },
  {
    id: "inv-overview",
    label: "Inventory Overview",
    expandable: true,
    items: [
      {
        id: "inventory-dashboard",
        label: "Inventory Dashboard",
        icon: LayoutDashboard,
        roles: INVENTORY_ROLES,
      },
      {
        id: "inventory",
        label: "Products",
        icon: Package,
        roles: INVENTORY_ROLES,
      },
    ],
  },
  {
    id: "inv-stock-ops",
    label: "Stock Operations",
    expandable: true,
    items: [
      {
        id: "stock-management",
        label: "Stock Management",
        icon: Warehouse,
        roles: INVENTORY_ROLES,
      },
      {
        id: "stock-view",
        label: "Stock by Location",
        icon: Grid3X3,
        roles: INVENTORY_ROLES,
      },
      {
        id: "purchases",
        label: "Stock In",
        icon: Truck,
        roles: PURCHASE_ROLES,
      },
      {
        id: "stock-out",
        label: "Stock Out",
        icon: Package,
        roles: STOCK_OUT_ROLES,
      },
      {
        id: "transfers",
        label: "Transfers",
        icon: ArrowRightLeft,
        roles: INVENTORY_ROLES,
      },
      {
        id: "stock-adjustment",
        label: "Stock Adjustment",
        icon: SlidersHorizontal,
        roles: INVENTORY_ROLES,
      },
    ],
  },
  {
    id: "inv-movements",
    label: "Movements & Adjustments",
    expandable: true,
    items: [
      {
        id: "stock-movement-log",
        label: "Movement Log",
        icon: History,
        roles: INVENTORY_ROLES,
      },
    ],
  },
  {
    id: "inv-insights",
    label: "Inventory Reports & Audit",
    expandable: true,
    items: [
      {
        id: "inventory-reports",
        label: "Inventory Reports",
        icon: LineChart,
        roles: INVENTORY_ROLES,
      },
      {
        id: "purchase-report",
        label: "Purchase Report",
        icon: Truck,
        roles: INVENTORY_ROLES,
      },
      {
        id: "stock-quantity-report",
        label: "Stock Quantity Report",
        icon: Boxes,
        roles: INVENTORY_ROLES,
      },
      {
        id: "inventory-audit",
        label: "Inventory Financial Audit",
        icon: Shield,
        roles: INVENTORY_ROLES,
      },
    ],
  },
  {
    id: "inv-catalog",
    label: "Catalog Data",
    expandable: true,
    items: [
      {
        id: "categories",
        label: "Categories",
        icon: Grid3X3,
        roles: BRANCH_DATA_ROLES,
      },
      /*
      {
        id: "sub-categories",
        label: "Sub-Categories",
        icon: Tags,
        roles: ADMIN_ROLES,
      },
      */
      { id: "units", label: "Units", icon: Package, roles: ADMIN_ROLES },
      { id: "brand", label: "Brands", icon: StoreIcon, roles: ADMIN_ROLES },
      { id: "colors", label: "Colors", icon: Package, roles: ADMIN_ROLES },
      { id: "sizes", label: "Sizes", icon: Package, roles: ADMIN_ROLES },
    ],
  },
  {
    id: "inv-master",
    label: "Master Data",
    expandable: true,
    items: [
      {
        id: "branches",
        label: "Branches",
        icon: Store,
        roles: BRANCH_DATA_ROLES,
      },
      {
        id: "suppliers",
        label: "Suppliers",
        icon: Truck,
        roles: ADMIN_ROLES,
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    expandable: true,
    items: [
      { id: "promotions", label: "Promotions", icon: BadgePercent, roles: SALES_ROLES },
      { id: "loyalty", label: "Loyalty", icon: Award, roles: SALES_ROLES },
      { id: "gift-cards", label: "Gift Cards", icon: Gift, roles: SALES_ROLES },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    expandable: true,
    items: [
      { id: "customers", label: "Customers", icon: Users, roles: SALES_ROLES },
    ],
  },
  {
    id: "staff",
    label: "Staff & HR",
    expandable: true,
    items: [
      { id: "employees", label: "Employees", icon: UserCheck, roles: ADMIN_ROLES },
      { id: "shifts", label: "Shift Management", icon: Clock, roles: ADMIN_ROLES },
      { id: "salaries", label: "Salaries", icon: CreditCard, roles: ADMIN_ROLES },
      { id: "commissions", label: "Commissions", icon: Percent, roles: ADMIN_ROLES },
      {
        id: "designation",
        label: "Designation",
        icon: Shield,
        roles: ADMIN_ROLES,
      },
    ],
  },
  {
    id: "accounts",
    label: "Accounts",
    expandable: true,
    items: [
      { id: "chart-of-accounts", label: "Chart of Accounts", icon: ListTree, roles: SALES_ROLES },
      { id: "journal-vouchers", label: "Journal Vouchers", icon: NotebookPen, roles: SALES_ROLES },
      { id: "expense-breakdown", label: "Expense Breakdown", icon: PieChart, roles: SALES_ROLES },
      { id: "budgets", label: "Budgets", icon: Target, roles: SALES_ROLES },
      { id: "close-books", label: "Close Books", icon: BookLock, roles: SALES_ROLES },
    ],
  },
  {
    id: "system",
    label: "System & Admin",
    expandable: true,
    items: [
      {
        id: "reports",
        label: "Reports & Analytics",
        icon: BarChart3,
        roles: ADMIN_ROLES,
      },
      {
        id: "tax-management",
        label: "Tax Setup",
        icon: Percent,
        roles: ADMIN_ROLES,
      },
      {
        id: "insights",
        label: "Business Insights",
        icon: Lightbulb,
        roles: SALES_ROLES,
      },
      {
        id: "financial-statement",
        label: "Financial Statement",
        icon: Scale,
        roles: SALES_ROLES,
      },
      {
        id: "profit-loss",
        label: "Profit & Loss",
        icon: LineChart,
        roles: SALES_ROLES,
      },
      {
        id: "balance-sheet",
        label: "Balance Sheet",
        icon: Wallet,
        roles: SALES_ROLES,
      },
      {
        id: "trial-balance",
        label: "Trial Balance",
        icon: BookOpen,
        roles: SALES_ROLES,
      },
      {
        id: "product-sales-profit",
        label: "Product Sales & Profit",
        icon: Percent,
        roles: SALES_ROLES,
      },
      {
        id: "users",
        label: "Users & Permissions",
        icon: KeyRound,
        roles: ADMIN_ROLES,
      },
      {
        id: "audit",
        label: "Audit Trail",
        icon: Shield,
        roles: ADMIN_ROLES,
      },
      {
        id: "product-export",
        label: "Product Export",
        icon: Download,
        roles: ADMIN_ROLES,
      },
      {
        id: "printer-settings",
        label: "Printer Settings",
        icon: PrinterIcon,
        roles: STAFF_ROLES,
      },
    ],
  },
];

const filterMenuSectionsByRole = (role: UserRole | null): SidebarMenuSection[] => {
  if (role === "SUPER_ADMIN") {
    return menuSections;
  }

  if (!role) {
    return [];
  }

  // Cashiers see only the counter screens; supervisors see what a branch manager sees.
  const CASHIER_TABS = new Set(["new-sale", "sales-history", "returns", "exchanges", "customers", "till", "printer-settings", "today-revenue", "today-cash-sales"]);
  const roleAllows = (roles?: UserRole[]) => {
    if (!roles) return role !== "CASHIER";
    if (roles.includes(role)) return true;
    return role === "SUPERVISOR" && roles.includes("BRANCH_MANAGER");
  };

  return menuSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        role === "CASHIER" ? CASHIER_TABS.has(item.id) : roleAllows(item.roles)
      ),
    }))
    .filter((section) => section.items.length > 0);
};

const getVisibleTabIds = (sections: SidebarMenuSection[]) =>
  sections.flatMap((section) => section.items.map((item) => item.id));

export function Sidebar({
  activeTab,
  setActiveTab,
  onLogout,
  isOpen = true,
  onClose,
}: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>([
    "sales",
    "inv-overview",
    "inv-stock",
    "inv-insights",
    "inv-master",
    "customers",
    "staff",
    "system",
  ]);
  const [role, setRole] = useState<UserRole | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const syncRole = () => {
      setRole(normalizeUserRole(localStorage.getItem("role")));
    };

    syncRole();
    window.addEventListener("storage", syncRole);

    return () => window.removeEventListener("storage", syncRole);
  }, []);

  const resetChangePasswordForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        variant: "destructive",
        title: "Missing fields",
        description: "Fill in your current password and the new password twice.",
      });
      return;
    }
    if (newPassword.length < 6) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "New password must be at least 6 characters.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Passwords don't match",
        description: "New password and confirmation must match.",
      });
      return;
    }

    setChangingPassword(true);
    try {
      await apiClient.patch("/auth/change-password", { currentPassword, newPassword });
      toast({
        variant: "success",
        title: "Password updated",
        description: "Use your new password next time you sign in.",
      });
      setShowChangePassword(false);
      resetChangePasswordForm();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not update password",
        description: error?.response?.data?.message || "Something went wrong.",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const filteredMenuSections = filterMenuSectionsByRole(role);

  useEffect(() => {
    const visibleTabIds = getVisibleTabIds(filteredMenuSections);
    if (!visibleTabIds.length || visibleTabIds.includes(activeTab)) {
      return;
    }

    const preferredTab = getDefaultDashboardTab(role);
    setActiveTab(
      visibleTabIds.includes(preferredTab) ? preferredTab : visibleTabIds[0]
    );
  }, [activeTab, filteredMenuSections, role, setActiveTab]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section)
        ? prev.filter((value) => value !== section)
        : [...prev, section]
    );
  };

  const handleMenuClick = (itemId: string) => {
    setActiveTab(itemId);
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <div
        className={`
          fixed inset-y-0 left-0 z-50
          flex w-72 flex-col border-r border-gray-200 bg-white shadow-sm
          transition-transform duration-300 ease-in-out lg:static
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <div className="absolute right-4 top-4 z-10 lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="border-b border-gray-200 px-5 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Pehnawa Boutique Pos" className="h-12 w-auto max-w-full object-contain object-left" />
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">
            {filteredMenuSections.map((section) => (
              <div key={section.id}>
                {section.expandable ? (
                  <div>
                    <Button
                      variant="ghost"
                      className="mb-2 h-8 w-full justify-between text-xs font-semibold uppercase tracking-wider text-gray-500"
                      onClick={() => toggleSection(section.id)}
                    >
                      {section.label}
                      {expandedSections.includes(section.id) ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </Button>
                    {expandedSections.includes(section.id) && (
                      <div className="space-y-1">
                        {section.items.map((item) => {
                          const Icon = item.icon;

                          return (
                            <Button
                              key={item.id}
                              variant={activeTab === item.id ? "default" : "ghost"}
                              className={`w-full justify-start pl-6 ${
                                activeTab === item.id
                                  ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                                  : "text-gray-700 hover:bg-gray-100"
                              }`}
                              onClick={() => handleMenuClick(item.id)}
                            >
                              <Icon className="mr-3 h-4 w-4" />
                              {item.label}
                              {item.badge && (
                                <Badge
                                  variant={
                                    item.badge === "Live"
                                      ? "destructive"
                                      : "secondary"
                                  }
                                  className="ml-auto text-xs"
                                >
                                  {item.badge}
                                </Badge>
                              )}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {section.label}
                    </div>
                    <div className="space-y-1">
                      {section.items.map((item) => {
                        const Icon = item.icon;

                        return (
                          <Button
                            key={item.id}
                            variant={activeTab === item.id ? "default" : "ghost"}
                            className={`w-full justify-start ${
                              activeTab === item.id
                                ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                                : "text-gray-700 hover:bg-gray-100"
                            }`}
                            onClick={() => handleMenuClick(item.id)}
                          >
                            <Icon className="mr-3 h-4 w-4" />
                            {item.label}
                            {item.badge && (
                              <Badge
                                variant={
                                  item.badge === "Live"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className="ml-auto text-xs"
                              >
                                {item.badge}
                              </Badge>
                            )}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {section.id !== "system" && <Separator className="mt-4" />}
              </div>
            ))}
          </div>
        </nav>

        <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-1">
          <Button
            variant="ghost"
            className="w-full justify-start text-gray-700 hover:bg-gray-100"
            onClick={() => setShowChangePassword(true)}
          >
            <KeyRound className="mr-3 h-4 w-4" />
            Change Password
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={onLogout}
          >
            <LogOut className="mr-3 h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>

      <Dialog
        open={showChangePassword}
        onOpenChange={(open) => {
          setShowChangePassword(open);
          if (!open) resetChangePasswordForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Update the password you use to sign in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="pr-10"
                  disabled={changingPassword}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  disabled={changingPassword}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="pr-10"
                  disabled={changingPassword}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  disabled={changingPassword}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type={showNewPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={changingPassword}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangePassword(false)} disabled={changingPassword}>
              Cancel
            </Button>
            <Button onClick={handleChangePassword} disabled={changingPassword}>
              {changingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Password"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
