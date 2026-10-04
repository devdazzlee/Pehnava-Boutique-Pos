"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";
import { DashboardHome } from "@/components/dashboard-home";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useDashboardTab } from "@/lib/dashboard-tabs";
import { scrollMainToTop } from "@/lib/scroll-main";
import { useDismissKeyboardOnScroll } from "@/hooks/use-dismiss-keyboard-on-scroll";

import { CustomerHub } from "@/components/customer-hub/customer-hub";
import { Reports } from "@/components/reports";
import { RegisterReport } from "@/components/register-report";
import { RegisterHub } from "@/components/register-hub/register-hub";
import { InsightsHub } from "@/components/insights/insights-hub";
import { Budgets } from "@/components/finance-controls/budgets";
import { CloseBooks } from "@/components/finance-controls/close-books";
import { FinancialStatement } from "@/components/financial-statement";
import { ProfitLoss } from "@/components/profit-loss";
import { BalanceSheet } from "@/components/balance-sheet";
import { TrialBalance } from "@/components/trial-balance";
import { ChartOfAccounts } from "@/components/chart-of-accounts";
import { DayReports } from "@/components/day-reports";
import { SalesReport } from "@/components/sales-report";
import { PurchaseReport } from "@/components/purchase-report";
import { StockQuantityReport } from "@/components/stock-quantity-report";
import { ProductSalesProfit } from "@/components/product-sales-profit";
import { Settings } from "@/components/settings";
import { SalesHistory } from "@/components/sales-history";
import { EmployeeHub } from "@/components/employee-hub/employee-hub";
import { Categories } from "@/components/categories";
import { PromotionsHub } from "@/components/marketing/promotions-hub";
import { Expenses } from "@/components/expenses";
import { TaxHub } from "@/components/marketing/tax-hub";

const dayViewToTab = (view: "revenue" | "cash" | "credit" | "expenses") => {
  if (view === "cash") return "today-cash-sales";
  if (view === "credit") return "today-credit-sales";
  if (view === "expenses") return "today-expenses";
  return "today-revenue";
};
import { PurchaseOrders } from "@/components/purchase-orders";
import { Returns } from "@/components/returns";
import { GiftCardsHub } from "@/components/marketing/gift-cards-hub";
import { LoyaltyHub } from "@/components/marketing/loyalty-hub";
import { Shifts } from "@/components/shifts";
import { AuditTrail } from "@/components/security/audit-trail";
import { UsersPermissions } from "@/components/security/users-permissions";
import { ApprovalDialogHost } from "@/components/security/approval-dialog-host";
import { installExportAuditing } from "@/lib/audit-client";
import { Backup } from "@/components/backup";
import { Integrations } from "@/components/integrations";
import { MultiLocation } from "@/components/multi-location";
import { Reservations } from "@/components/reservations";
import { LayawayHolds } from "@/components/layaway-holds";
import { Pricing } from "@/components/pricing";
import { Branches } from "./branches";
import Inventory from "./inventory";
import { StockManagement } from "./StockManagement";
import {
  InventoryDashboard,
  Purchases,
  Transfers,
  StockOut,
  StockMovementLog,
  StockAdjustment,
  StockView,
  InventoryReports,
  InventoryAudit,
  BulkProductUpload,
} from "./inventory/index";
import Orders from "./orders";
import Subcategories from "./sub-categories";
import Units from "./Units";
import { SupplierHub } from "./supplier-hub/supplier-hub";
import Brands from "./Brands";
import Colors from "./color";
import Sizes from "./sizes";
import { Salaries } from "./Salaries";
import { CommissionHub } from "./commission-hub/commission-hub";
import { Designation } from "./Designation";
import BarcodeGenerator from "./barcode-generator";
import { NewSale } from "./new-sale";
import { PrinterSettings } from "./printer-settings";
import { ProductExport } from "./product-export";


interface DashboardProps {
  onLogout: () => void;
}

export function Dashboard({ onLogout }: DashboardProps) {
  const { activeTab, setActiveTab } = useDashboardTab();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useDismissKeyboardOnScroll();
  useEffect(() => {
    installExportAuditing();
  }, []);

  useEffect(() => {
    scrollMainToTop("auto");
  }, [activeTab]);

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardHome onNavigate={setActiveTab} />;
      case "today-revenue":
        return (
          <DayReports
            lockedView="revenue"
            onNavigateView={(view) => setActiveTab(dayViewToTab(view))}
            onBack={() => setActiveTab("dashboard")}
          />
        );
      case "today-cash-sales":
        return (
          <DayReports
            lockedView="cash"
            onNavigateView={(view) => setActiveTab(dayViewToTab(view))}
            onBack={() => setActiveTab("dashboard")}
          />
        );
      case "today-credit-sales":
        return (
          <DayReports
            lockedView="credit"
            onNavigateView={(view) => setActiveTab(dayViewToTab(view))}
            onBack={() => setActiveTab("dashboard")}
          />
        );
      case "today-expenses":
        return (
          <DayReports
            lockedView="expenses"
            onNavigateView={(view) => setActiveTab(dayViewToTab(view))}
            onBack={() => setActiveTab("dashboard")}
          />
        );
      case "barcode-generator":
        return <BarcodeGenerator />;
      case "new-sale":
        return <NewSale />;
      case "orders":
        return <Orders />;
      case "units":
        return <Units />;
      case "sales-history":
        return <SalesHistory />;
      case "register-report":
        return <RegisterReport />;
      case "till":
        return <RegisterHub />;
      case "sales-report":
        return <SalesReport />;
      case "brand":
        return <Brands />;
      case "colors":
        return <Colors />;
      case "sizes":
        return <Sizes />;
      case "returns":
        return <Returns initialTab="returns" hideModuleTabs />;
      case "exchanges":
        return <Returns initialTab="exchanges" hideModuleTabs />;
      case "reservations":
        return <Reservations />;
      case "layaway-holds":
        return <LayawayHolds />;
      case "inventory":
        return <Inventory />;
      case "categories":
        return <Categories />;
      case "sub-categories":
        return <Subcategories />;
      case "branches":
        return <Branches />;
      case "suppliers":
        return <SupplierHub />;
      case "purchase-orders":
        return <PurchaseOrders />;
      case "pricing":
        return <Pricing />;
      case "customers":
        return <CustomerHub />;
      case "loyalty":
        return <LoyaltyHub />;
      case "gift-cards":
        return <GiftCardsHub />;
      case "stock-management":
        return <StockManagement onNavigate={setActiveTab} />;
      case "inventory-dashboard":
        return <InventoryDashboard onNavigate={setActiveTab} />;
      case "purchases":
        return <Purchases onNavigate={setActiveTab} />;
      case "transfers":
        return <Transfers />;
      case "stock-out":
        return <StockOut onNavigate={setActiveTab} />;
      case "stock-movement-log":
        return <StockMovementLog />;
      case "stock-adjustment":
        return <StockAdjustment />;
      case "stock-view":
        return <StockView onNavigate={setActiveTab} />;
      case "bulk-product-upload":
        return <BulkProductUpload />;
      case "inventory-reports":
        return <InventoryReports />;
      case "purchase-report":
        return <PurchaseReport />;
      case "stock-quantity-report":
        return <StockQuantityReport />;
      case "inventory-audit":
        return <InventoryAudit />;
      case "designation":
        return <Designation />;
      case "employees":
        return <EmployeeHub />;
      case "shifts":
        return <Shifts />;
      case "salaries":
        return <Salaries />;
      case "commissions":
        return <CommissionHub />;
      case "promotions":
        return <PromotionsHub />;
      case "expenses":
        return <Expenses />;
      case "tax-management":
        return <TaxHub />;
      case "budgets":
        return <Budgets />;
      case "close-books":
        return <CloseBooks />;
      case "insights":
        return <InsightsHub />;
      case "reports":
        return <Reports />;
      case "financial-statement":
        return <FinancialStatement />;
      case "profit-loss":
        return <ProfitLoss />;
      case "balance-sheet":
        return <BalanceSheet />;
      case "trial-balance":
        return <TrialBalance />;
      case "chart-of-accounts":
        return <ChartOfAccounts initialTab="accounts" onNavigate={setActiveTab} />;
      case "journal-vouchers":
        return <ChartOfAccounts initialTab="vouchers" onNavigate={setActiveTab} />;
      case "expense-breakdown":
        return <ChartOfAccounts initialTab="breakdown" onNavigate={setActiveTab} />;
      case "product-sales-profit":
        return <ProductSalesProfit />;
      case "audit":
        return <AuditTrail />;
      case "users":
        return <UsersPermissions />;
      case "multi-location":
        return <MultiLocation />;
      case "integrations":
        return <Integrations />;
      case "backup":
        return <Backup />;
      case "settings":
        return <Settings />;
      case "printer-settings":
        return <PrinterSettings />;
      case "product-export":
        return <ProductExport />;
      default:
        return <DashboardHome onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="flex min-h-dvh bg-gray-50 lg:h-dvh lg:max-h-dvh lg:overflow-hidden">
      <ApprovalDialogHost />
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={onLogout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      
      {/* Mobile Top App Bar */}
      <header className="lg:hidden fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-3 shadow-sm sm:h-16 sm:px-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSidebarOpen(true)}
          className="h-9 w-9 p-0 text-gray-700 hover:bg-gray-100"
        >
          <Menu className="h-5 w-5" />
        </Button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Pehnawa Boutique Pos" className="h-8 w-auto max-w-[180px] object-contain object-left" />
      </header>

      <main
        id="app-main-scroll"
        className="flex w-full min-w-0 flex-1 flex-col pt-14 sm:pt-16 lg:min-h-0 lg:overflow-y-auto lg:pt-0"
      >
        {renderContent()}
      </main>
    </div>
  );
}
