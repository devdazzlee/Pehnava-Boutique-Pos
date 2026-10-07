"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  readInsightsReportFromUrl,
  readSalesByDimensionFromUrl,
  SALES_BY_DIMENSION_IDS,
  writeInsightsParamsToUrl,
} from "@/lib/dashboard-tabs";
import { Card, Chips, Column, DataTable, day, Empty, errorText, insightsGet, Kpi, KpiRow, Loading, pct, Period, qty, rs, ShareBars } from "./insights-shared";

type Scope = { period: Period; branchId?: string };

function useReport<T>(path: string, params: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify([path, params]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    insightsGet<T>(path, params)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(errorText(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, error, loading };
}

function Frame<T>({ state, children }: { state: { data: T | null; error: string | null; loading: boolean }; children: (d: T) => React.ReactNode }) {
  if (state.error)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        <AlertTriangle className="h-4 w-4" />
        {state.error}
      </div>
    );
  if (state.loading && !state.data) return <Loading />;
  if (!state.data) return <Empty />;
  return <div className={cn("space-y-4 transition-opacity", state.loading && "opacity-60")}>{children(state.data)}</div>;
}

const tone = (v: number) => (v > 0.5 ? "good" : v < -0.5 ? "bad" : undefined);
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${rs(Math.abs(v))}`;

/* ====================================================================== */

type SalesRow = {
  key: string;
  label: string;
  qty: number;
  returnedQty: number;
  netQty: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  bills: number;
  products: number;
  share: number;
  returnRate: number;
};
const DIMS = [
  { id: "category", label: "Category" },
  { id: "subcategory", label: "Sub-category" },
  { id: "brand", label: "Brand" },
  { id: "collection", label: "Collection" },
  { id: "size", label: "Size" },
  { id: "color", label: "Colour" },
  { id: "supplier", label: "Supplier" },
  { id: "product", label: "Product" },
] as const;

export function SalesByReport({ period, branchId }: Scope) {
  const [dim, setDimState] = useState<(typeof DIMS)[number]["id"]>(() => {
    const fromUrl = readSalesByDimensionFromUrl();
    if (fromUrl && SALES_BY_DIMENSION_IDS.has(fromUrl)) {
      return fromUrl as (typeof DIMS)[number]["id"];
    }
    return "category";
  });

  const setDim = (next: (typeof DIMS)[number]["id"]) => {
    setDimState(next);
    const report = readInsightsReportFromUrl() ?? "sales-by";
    writeInsightsParamsToUrl(report, next);
  };

  useEffect(() => {
    const onPopState = () => {
      const fromUrl = readSalesByDimensionFromUrl();
      if (fromUrl && SALES_BY_DIMENSION_IDS.has(fromUrl)) {
        setDimState(fromUrl as (typeof DIMS)[number]["id"]);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const state = useReport<{ rows: SalesRow[]; totals: { qty: number; revenue: number; cost: number; profit: number } }>("sales-by", {
    dimension: dim,
    from: period.from,
    to: period.to,
    branchId,
  });
  const dimLabel = DIMS.find((d) => d.id === dim)!.label;
  const cols: Column<SalesRow>[] = [
    { key: "label", label: dimLabel, render: (r) => <span className="font-medium text-stone-800">{r.label}</span> },
    { key: "netQty", label: "Qty sold", align: "right", render: (r) => qty(r.netQty) },
    { key: "returnedQty", label: "Returned", align: "right", render: (r) => (r.returnedQty ? `${qty(r.returnedQty)} (${pct(r.returnRate)})` : "—") },
    { key: "bills", label: "Bills", align: "right" },
    { key: "revenue", label: "Net sales", align: "right", render: (r) => rs(r.revenue) },
    { key: "profit", label: "Gross profit", align: "right", render: (r) => rs(r.profit) },
    { key: "margin", label: "Margin", align: "right", render: (r) => pct(r.margin) },
    { key: "share", label: "Share", align: "right", render: (r) => pct(r.share) },
  ];
  return (
    <div className="space-y-4">
      <Chips value={dim} onChange={setDim} options={DIMS.map((d) => ({ id: d.id, label: d.label }))} />
      <Frame state={state}>
        {(d) => (
          <>
            <KpiRow>
              <Kpi tone="dark" label="Net sales" value={rs(d.totals.revenue)} hint={`${d.rows.length} ${dimLabel.toLowerCase()} groups`} />
              <Kpi label="Items sold" value={qty(d.totals.qty)} />
              <Kpi label="Gross profit" value={rs(d.totals.profit)} hint={d.totals.revenue ? `${pct((d.totals.profit / d.totals.revenue) * 100)} margin` : undefined} />
              <Kpi label={`Top ${dimLabel.toLowerCase()}`} value={d.rows[0]?.label ?? "—"} hint={d.rows[0] ? `${pct(d.rows[0].share)} of sales` : undefined} />
            </KpiRow>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card title={`Sales by ${dimLabel.toLowerCase()}`} className="lg:col-span-1">
                <ShareBars rows={d.rows.map((r) => ({ label: r.label, value: r.revenue, hint: pct(r.share) }))} />
              </Card>
              <Card title="Details" className="lg:col-span-2">
                <DataTable rows={d.rows} columns={cols} rowKey={(r) => r.key} search={(r) => r.label} exportName={`sales-by-${dim}`} />
              </Card>
            </div>
          </>
        )}
      </Frame>
    </div>
  );
}

/* ====================================================================== */

type SlowRow = {
  productId: string;
  name: string;
  sku: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  color: string | null;
  stock: number;
  soldInPeriod: number;
  lastSoldAt: string | null;
  idleDays: number;
  coverDays: number | null;
  stockValue: number;
  retailValue: number;
  status: "DEAD" | "SLOW";
};

export function SlowMoversReport({ branchId }: Scope) {
  const [days, setDays] = useState("60");
  const [filter, setFilter] = useState<"all" | "DEAD" | "SLOW">("all");
  const state = useReport<{ days: number; rows: SlowRow[]; totals: { products: number; dead: number; slow: number; stockValue: number; retailValue: number } }>(
    "slow-movers",
    { days, branchId },
  );
  const cols: Column<SlowRow>[] = [
    {
      key: "name",
      label: "Product",
      render: (r) => (
        <div>
          <div className="font-medium text-stone-800">{r.name}</div>
          <div className="text-xs text-stone-500">{[r.sku, r.category, r.brand, r.size, r.color].filter(Boolean).join(" · ")}</div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (r) => (
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", r.status === "DEAD" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800")}>
          {r.status === "DEAD" ? "Not selling" : "Slow"}
        </span>
      ),
    },
    { key: "stock", label: "In stock", align: "right", render: (r) => qty(r.stock) },
    { key: "soldInPeriod", label: `Sold (${days}d)`, align: "right", render: (r) => qty(r.soldInPeriod) },
    { key: "idleDays", label: "Days idle", align: "right" },
    { key: "lastSoldAt", label: "Last sold", align: "right", render: (r) => (r.lastSoldAt ? day(r.lastSoldAt) : "Never") },
    { key: "stockValue", label: "Cost value", align: "right", render: (r) => rs(r.stockValue) },
    { key: "retailValue", label: "Retail value", align: "right", render: (r) => rs(r.retailValue) },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-stone-600">Look back</span>
        <Chips value={days} onChange={setDays} options={["30", "60", "90", "180"].map((d) => ({ id: d, label: `${d} days` }))} />
      </div>
      <Frame state={state}>
        {(d) => (
          <>
            <KpiRow>
              <Kpi tone="dark" label="Money stuck in slow stock" value={rs(d.totals.stockValue)} hint={`Retail ${rs(d.totals.retailValue)}`} />
              <Kpi label="Slow products" value={String(d.totals.products)} />
              <Kpi label="Not sold at all" value={String(d.totals.dead)} tone={d.totals.dead ? "bad" : undefined} hint={`in ${d.days} days`} />
              <Kpi label="Selling slowly" value={String(d.totals.slow)} hint="≤ 2 sold" />
            </KpiRow>
            <Card
              title="Slow & non-moving stock"
              subtitle="Consider discounts, bundles or returning to supplier."
              action={
                <Chips
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { id: "all", label: "All", count: d.rows.length },
                    { id: "DEAD", label: "Not selling", count: d.totals.dead },
                    { id: "SLOW", label: "Slow", count: d.totals.slow },
                  ]}
                />
              }
            >
              <DataTable
                rows={filter === "all" ? d.rows : d.rows.filter((r) => r.status === filter)}
                columns={cols}
                rowKey={(r) => r.productId}
                search={(r) => [r.name, r.sku, r.category, r.brand].join(" ")}
                exportName="slow-movers"
              />
            </Card>
          </>
        )}
      </Frame>
    </div>
  );
}

/* ====================================================================== */

type CustRow = {
  id: string;
  name: string;
  phone: string | null;
  firstPurchase: string;
  lastPurchase: string;
  lifetimeSpend: number;
  lifetimeBills: number;
  periodSpend: number;
  periodBills: number;
  avgBill: number;
  daysSinceLast: number;
};
type CustData = {
  inactiveDays: number;
  summary: {
    customersWithPurchases: number;
    activeInPeriod: number;
    newInPeriod: number;
    repeatInPeriod: number;
    inactive: number;
    repeatRate: number;
    periodRevenue: number;
    top10Share: number;
    avgSpend: number;
  };
  top: CustRow[];
  new: CustRow[];
  repeat: CustRow[];
  inactive: CustRow[];
};

export function CustomersReport({ period, branchId }: Scope) {
  const [seg, setSeg] = useState<"top" | "new" | "repeat" | "inactive">("top");
  const [inactiveDays, setInactiveDays] = useState("90");
  const state = useReport<CustData>("customers", { from: period.from, to: period.to, branchId, inactiveDays });
  const cols: Column<CustRow>[] = [
    {
      key: "name",
      label: "Customer",
      render: (r) => (
        <div>
          <div className="font-medium text-stone-800">{r.name}</div>
          <div className="text-xs text-stone-500">{r.phone ?? "—"}</div>
        </div>
      ),
    },
    ...(seg === "inactive"
      ? []
      : ([
          { key: "periodSpend", label: "Spent (period)", align: "right", render: (r) => rs(r.periodSpend) },
          { key: "periodBills", label: "Visits (period)", align: "right" },
        ] as Column<CustRow>[])),
    { key: "lifetimeSpend", label: "Lifetime spend", align: "right", render: (r) => rs(r.lifetimeSpend) },
    { key: "lifetimeBills", label: "Total visits", align: "right" },
    { key: "avgBill", label: "Avg bill", align: "right", render: (r) => rs(r.avgBill) },
    { key: "firstPurchase", label: "Customer since", align: "right", render: (r) => day(r.firstPurchase) },
    { key: "lastPurchase", label: "Last visit", align: "right", render: (r) => `${day(r.lastPurchase)} (${r.daysSinceLast}d)` },
  ];
  return (
    <Frame state={state}>
      {(d) => (
        <>
          <KpiRow>
            <Kpi tone="dark" label="Customers who bought" value={String(d.summary.activeInPeriod)} hint={`Avg spend ${rs(d.summary.avgSpend)}`} />
            <Kpi label="New customers" value={String(d.summary.newInPeriod)} hint="first purchase in period" />
            <Kpi label="Repeat rate" value={pct(d.summary.repeatRate)} hint={`${d.summary.repeatInPeriod} returning customers`} />
            <Kpi label="Top 10 share" value={pct(d.summary.top10Share)} hint="of named-customer sales" />
          </KpiRow>
          <Card
            action={
              seg === "inactive" ? (
                <div className="flex items-center gap-2 text-sm text-stone-600">
                  No visit for
                  <Select value={inactiveDays} onValueChange={setInactiveDays}>
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["30", "60", "90", "180", "365"].map((v) => (
                        <SelectItem key={v} value={v}>
                          {v} days
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : undefined
            }
            title="Customer segments"
            subtitle="Only bills with a customer attached are counted."
          >
            <div className="mb-3">
              <Chips
                value={seg}
                onChange={setSeg}
                options={[
                  { id: "top", label: "Top customers", count: d.top.length },
                  { id: "new", label: "New", count: d.new.length },
                  { id: "repeat", label: "Repeat", count: d.repeat.length },
                  { id: "inactive", label: "Inactive", count: d.inactive.length },
                ]}
              />
            </div>
            <DataTable rows={d[seg]} columns={cols} rowKey={(r) => r.id} search={(r) => `${r.name} ${r.phone ?? ""}`} exportName={`customers-${seg}`} />
          </Card>
        </>
      )}
    </Frame>
  );
}

/* ====================================================================== */

type SupRow = {
  id: string;
  name: string;
  code: string;
  purchased: number;
  qty: number;
  bills: number;
  products: number;
  returned: number;
  returnRate: number;
  paid: number;
  overdue: number;
  lastPurchase: string | null;
  soldQty: number;
  soldRevenue: number;
  sellThrough: number;
};

export function SuppliersReport({ period, branchId }: Scope) {
  const state = useReport<{ rows: SupRow[]; totals: { suppliers: number; purchased: number; returned: number; paid: number; overdue: number } }>("suppliers", {
    from: period.from,
    to: period.to,
    branchId,
  });
  const cols: Column<SupRow>[] = [
    { key: "name", label: "Supplier", render: (r) => <span className="font-medium text-stone-800">{r.name}</span> },
    { key: "purchased", label: "Purchased", align: "right", render: (r) => rs(r.purchased) },
    { key: "bills", label: "Bills", align: "right" },
    { key: "products", label: "Products", align: "right" },
    { key: "returned", label: "Returned", align: "right", render: (r) => (r.returned ? `${rs(r.returned)} (${pct(r.returnRate)})` : "—") },
    {
      key: "sellThrough",
      label: "Sell-through",
      align: "right",
      render: (r) => (
        <span className={cn(r.sellThrough >= 60 ? "text-emerald-700" : r.sellThrough < 25 ? "text-rose-700" : "")}>
          {pct(r.sellThrough)} <span className="text-xs text-stone-400">({qty(r.soldQty)}/{qty(r.qty)})</span>
        </span>
      ),
    },
    { key: "paid", label: "Paid", align: "right", render: (r) => rs(r.paid) },
    { key: "overdue", label: "Overdue", align: "right", render: (r) => (r.overdue ? <span className="text-rose-700">{rs(r.overdue)}</span> : "—") },
    { key: "lastPurchase", label: "Last purchase", align: "right", render: (r) => day(r.lastPurchase) },
  ];
  return (
    <Frame state={state}>
      {(d) => (
        <>
          <KpiRow>
            <Kpi tone="dark" label="Purchased" value={rs(d.totals.purchased)} hint={`${d.totals.suppliers} suppliers`} />
            <Kpi label="Returned to suppliers" value={rs(d.totals.returned)} />
            <Kpi label="Paid in period" value={rs(d.totals.paid)} />
            <Kpi label="Overdue bills" value={rs(d.totals.overdue)} tone={d.totals.overdue ? "bad" : undefined} />
          </KpiRow>
          <Card title="Supplier performance" subtitle="Sell-through = how much of what you bought from them has sold since.">
            <DataTable rows={d.rows} columns={cols} rowKey={(r) => r.id} search={(r) => `${r.name} ${r.code}`} exportName="supplier-performance" />
          </Card>
        </>
      )}
    </Frame>
  );
}

/* ====================================================================== */

type PriceEntry = {
  id: string;
  date: string;
  product: { id: string; name: string; sku: string };
  supplier: { id: string; name: string };
  qty: number;
  cost: number;
  salePrice: number;
  margin: number | null;
  previousCost: number | null;
  change: number | null;
  changePct: number | null;
  reference: string | null;
};
type PriceProduct = { id: string; name: string; sku: string; first: number; last: number; min: number; max: number; buys: number; suppliers: string[]; change: number; changePct: number };

export function PurchasePricesReport({ period, branchId }: Scope) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [view, setView] = useState<"products" | "entries">("products");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);
  const state = useReport<{ entries: PriceEntry[]; products: PriceProduct[] }>("purchase-prices", { from: period.from, to: period.to, branchId, search: debounced });
  const changeCell = (v: number | null, p: number | null) =>
    v == null ? "—" : <span className={cn(v > 0 ? "text-rose-700" : v < 0 ? "text-emerald-700" : "text-stone-500")}>{`${signed(v)}${p != null ? ` (${pct(p)})` : ""}`}</span>;
  const productCols: Column<PriceProduct>[] = [
    {
      key: "name",
      label: "Product",
      render: (r) => (
        <div>
          <div className="font-medium text-stone-800">{r.name}</div>
          <div className="text-xs text-stone-500">{r.sku}</div>
        </div>
      ),
    },
    { key: "buys", label: "Purchases", align: "right" },
    { key: "first", label: "First cost", align: "right", render: (r) => rs(r.first) },
    { key: "last", label: "Latest cost", align: "right", render: (r) => rs(r.last) },
    { key: "min", label: "Lowest", align: "right", render: (r) => rs(r.min) },
    { key: "max", label: "Highest", align: "right", render: (r) => rs(r.max) },
    { key: "changePct", label: "Change", align: "right", render: (r) => changeCell(r.change, r.changePct) },
    { key: "suppliers", label: "Suppliers", value: (r) => r.suppliers.join(", ") },
  ];
  const entryCols: Column<PriceEntry>[] = [
    { key: "date", label: "Date", render: (r) => day(r.date), value: (r) => r.date },
    { key: "product", label: "Product", value: (r) => r.product.name, render: (r) => <span className="font-medium text-stone-800">{r.product.name}</span> },
    { key: "supplier", label: "Supplier", value: (r) => r.supplier.name },
    { key: "qty", label: "Qty", align: "right", render: (r) => qty(r.qty) },
    { key: "cost", label: "Cost", align: "right", render: (r) => rs(r.cost) },
    { key: "change", label: "vs previous", align: "right", render: (r) => changeCell(r.change, r.changePct) },
    { key: "salePrice", label: "Sale price", align: "right", render: (r) => rs(r.salePrice) },
    { key: "margin", label: "Margin", align: "right", render: (r) => pct(r.margin) },
    { key: "reference", label: "Bill ref", value: (r) => r.reference ?? "" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product name or SKU…" className="h-9 max-w-xs bg-white" />
        <Chips
          value={view}
          onChange={setView}
          options={[
            { id: "products", label: "By product" },
            { id: "entries", label: "Every purchase" },
          ]}
        />
      </div>
      <Frame state={state}>
        {(d) => (
          <>
            <KpiRow>
              <Kpi tone="dark" label="Purchases in period" value={String(d.entries.length)} />
              <Kpi label="Products bought" value={String(d.products.length)} />
              <Kpi label="Cost went up" value={String(d.products.filter((p) => p.change > 0).length)} tone={d.products.some((p) => p.change > 0) ? "bad" : undefined} />
              <Kpi label="Cost went down" value={String(d.products.filter((p) => p.change < 0).length)} tone={d.products.some((p) => p.change < 0) ? "good" : undefined} />
            </KpiRow>
            <Card title={view === "products" ? "Purchase price by product" : "Purchase price history"}>
              {view === "products" ? (
                <DataTable rows={d.products} columns={productCols} rowKey={(r) => r.id} exportName="purchase-prices-by-product" />
              ) : (
                <DataTable rows={d.entries} columns={entryCols} rowKey={(r) => r.id} exportName="purchase-price-history" />
              )}
            </Card>
          </>
        )}
      </Frame>
    </div>
  );
}

/* ====================================================================== */

type Buckets = { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number };
type AgingRow = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  due: number;
  advance: number;
  buckets: Buckets;
  oldestDays: number;
  bills: { ref: string; date: string; due: string; amount: number; outstanding: number; daysOverdue: number }[];
};
const BUCKETS: { key: keyof Buckets; label: string }[] = [
  { key: "current", label: "Not due" },
  { key: "d1_30", label: "1–30 days" },
  { key: "d31_60", label: "31–60" },
  { key: "d61_90", label: "61–90" },
  { key: "d90_plus", label: "90+" },
];

export function PayablesAgingReport() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState<string | null>(null);
  const state = useReport<{ asOf: string; rows: AgingRow[]; totals: Buckets & { due: number; advance: number; suppliers: number } }>("payables-aging", { asOf });
  const cols: Column<AgingRow>[] = [
    {
      key: "name",
      label: "Supplier",
      render: (r) => (
        <div>
          <div className="font-medium text-stone-800">{r.name}</div>
          <div className="text-xs text-stone-500">{r.phone ?? r.code}</div>
        </div>
      ),
    },
    ...BUCKETS.map(
      (b): Column<AgingRow> => ({
        key: b.key,
        label: b.label,
        align: "right",
        value: (r) => r.buckets[b.key],
        render: (r) => (r.buckets[b.key] ? <span className={cn(b.key === "d90_plus" || b.key === "d61_90" ? "font-semibold text-rose-700" : "")}>{rs(r.buckets[b.key])}</span> : <span className="text-stone-300">—</span>),
      }),
    ),
    { key: "due", label: "Total due", align: "right", render: (r) => <b>{rs(r.due)}</b> },
  ];
  const selected = state.data?.rows.find((r) => r.id === open);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-stone-600">
        As of
        <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-9 w-[160px] bg-white" />
      </div>
      <Frame state={state}>
        {(d) => (
          <>
            <KpiRow>
              <Kpi tone="dark" label="Total payable" value={rs(d.totals.due)} hint={`${d.totals.suppliers} suppliers`} />
              <Kpi label="Not yet due" value={rs(d.totals.current)} />
              <Kpi label="Over 60 days" value={rs(d.totals.d61_90 + d.totals.d90_plus)} tone={d.totals.d61_90 + d.totals.d90_plus > 0 ? "bad" : undefined} />
              <Kpi label="Advances paid" value={rs(d.totals.advance)} />
            </KpiRow>
            <Card title="Accounts payable aging" subtitle="Payments and returns settle the oldest bills first. Click a supplier to see open bills.">
              <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-stone-100">
                {BUCKETS.map((b, i) => {
                  const w = d.totals.due ? (d.totals[b.key] / d.totals.due) * 100 : 0;
                  return w > 0 ? (
                    <div
                      key={b.key}
                      title={`${b.label}: ${rs(d.totals[b.key])}`}
                      style={{ width: `${w}%`, backgroundColor: ["#d6c7a8", "#a67c2e", "#c2410c", "#b91c1c", "#7f1d1d"][i] }}
                    />
                  ) : null;
                })}
              </div>
              <DataTable rows={d.rows} columns={cols} rowKey={(r) => r.id} search={(r) => `${r.name} ${r.code}`} exportName="payables-aging" onRowClick={(r) => setOpen(r.id === open ? null : r.id)} />
            </Card>
            {selected && (
              <Card title={`Open bills — ${selected.name}`}>
                <DataTable
                  rows={selected.bills}
                  rowKey={(b) => `${b.ref}-${b.date}`}
                  columns={[
                    { key: "ref", label: "Bill" },
                    { key: "date", label: "Date", render: (b) => day(b.date) },
                    { key: "due", label: "Due", render: (b) => day(b.due) },
                    { key: "amount", label: "Bill amount", align: "right", render: (b) => rs(b.amount) },
                    { key: "outstanding", label: "Outstanding", align: "right", render: (b) => <b>{rs(b.outstanding)}</b> },
                    { key: "daysOverdue", label: "Overdue", align: "right", render: (b) => (b.daysOverdue > 0 ? `${b.daysOverdue} days` : "Not due") },
                  ]}
                />
              </Card>
            )}
          </>
        )}
      </Frame>
    </div>
  );
}

/* ====================================================================== */

type CashFlowData = {
  totals: { inflow: number; outflow: number; net: number };
  byKind: { kind: string; inflow: number; outflow: number; count: number }[];
  byMethod: { method: string; label: string; inflow: number; outflow: number; net: number }[];
  daily: { date: string; inflow: number; outflow: number; net: number }[];
};

export function CashFlowReport({ period, branchId }: Scope) {
  const state = useReport<CashFlowData>("cash-flow", { from: period.from, to: period.to, branchId });
  return (
    <Frame state={state}>
      {(d) => (
        <>
          <KpiRow>
            <Kpi label="Money in" value={rs(d.totals.inflow)} tone="good" />
            <Kpi label="Money out" value={rs(d.totals.outflow)} tone="bad" />
            <Kpi tone="dark" label="Net cash flow" value={signed(d.totals.net)} />
            <Kpi label="Busiest day in" value={d.daily.length ? rs(Math.max(...d.daily.map((x) => x.inflow))) : "—"} />
          </KpiRow>
          <Card title="Daily money in vs out">
            {d.daily.length === 0 ? (
              <Empty />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.daily} barGap={2}>
                    <CartesianGrid vertical={false} stroke="#eee" />
                    <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v)} tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip formatter={(v: number, n: string) => [rs(v), n === "inflow" ? "Money in" : "Money out"]} labelFormatter={(l) => day(l)} cursor={{ fill: "#f5f5f4" }} />
                    <Bar dataKey="inflow" fill="#a67c2e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="outflow" fill="#57534e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-2 flex gap-4 text-xs text-stone-600">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#a67c2e]" /> Money in
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#57534e]" /> Money out
              </span>
            </div>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Where money came from & went">
              <DataTable
                rows={d.byKind}
                rowKey={(r) => r.kind}
                exportName="cash-flow-by-type"
                columns={[
                  { key: "kind", label: "Type", render: (r) => <span className="font-medium">{r.kind}</span> },
                  { key: "count", label: "Entries", align: "right" },
                  { key: "inflow", label: "In", align: "right", render: (r) => (r.inflow ? rs(r.inflow) : "—") },
                  { key: "outflow", label: "Out", align: "right", render: (r) => (r.outflow ? rs(r.outflow) : "—") },
                ]}
              />
            </Card>
            <Card title="By payment method">
              <DataTable
                rows={d.byMethod}
                rowKey={(r) => r.method}
                columns={[
                  { key: "label", label: "Method", render: (r) => <span className="font-medium">{r.label}</span> },
                  { key: "inflow", label: "In", align: "right", render: (r) => rs(r.inflow) },
                  { key: "outflow", label: "Out", align: "right", render: (r) => rs(r.outflow) },
                  { key: "net", label: "Net", align: "right", render: (r) => <span className={cn(tone(r.net) === "bad" && "text-rose-700")}>{signed(r.net)}</span> },
                ]}
              />
            </Card>
          </div>
        </>
      )}
    </Frame>
  );
}

/* ====================================================================== */

type BookData = {
  book: "cash" | "bank";
  methods: string[];
  opening: number;
  receipts: number;
  payments: number;
  closing: number;
  note: string;
  rows: { id: string; date: string; kind: string; method: string; methodLabel: string; description: string; receipt: number; payment: number; balance: number }[];
};

export function BookReport({ period, branchId, book }: Scope & { book: "cash" | "bank" }) {
  const [method, setMethod] = useState("all");
  const state = useReport<BookData>(`book/${book}`, { from: period.from, to: period.to, branchId, method });
  return (
    <Frame state={state}>
      {(d) => (
        <>
          <KpiRow>
            <Kpi label="Opening balance" value={rs(d.opening)} />
            <Kpi label="Receipts" value={rs(d.receipts)} tone="good" />
            <Kpi label="Payments" value={rs(d.payments)} tone="bad" />
            <Kpi tone="dark" label="Closing balance" value={rs(d.closing)} />
          </KpiRow>
          <Card
            title={book === "cash" ? "Cash book" : "Bank book"}
            subtitle={d.note}
            action={
              book === "bank" && d.methods.length > 1 ? (
                <Chips value={method} onChange={setMethod} options={[{ id: "all", label: "All" }, ...d.methods.map((m) => ({ id: m, label: m.replace("_", " ").toLowerCase() }))]} />
              ) : undefined
            }
          >
            <DataTable
              rows={d.rows}
              rowKey={(r) => r.id}
              pageSize={50}
              search={(r) => `${r.kind} ${r.description}`}
              exportName={`${book}-book`}
              columns={[
                { key: "date", label: "Date", render: (r) => day(r.date) },
                { key: "kind", label: "Type" },
                { key: "description", label: "Details", className: "max-w-[260px]", render: (r) => <span className="line-clamp-2">{r.description}</span> },
                ...(book === "bank" ? [{ key: "methodLabel", label: "Method" } as Column<BookData["rows"][number]>] : []),
                { key: "receipt", label: "Receipt", align: "right", render: (r) => (r.receipt ? <span className="text-emerald-700">{rs(r.receipt)}</span> : "") },
                { key: "payment", label: "Payment", align: "right", render: (r) => (r.payment ? <span className="text-rose-700">{rs(r.payment)}</span> : "") },
                { key: "balance", label: "Balance", align: "right", render: (r) => <b>{rs(r.balance)}</b> },
              ]}
            />
          </Card>
        </>
      )}
    </Frame>
  );
}

/* ====================================================================== */

type TaxData = {
  totals: { output: number; input: number; net: number };
  outputByRate: { rate: number; taxable: number; tax: number; lines: number }[];
  inputInvoices: { id: string; invoiceNumber: string; date: string; supplier: string; ntn: string | null; taxable: number; tax: number; total: number }[];
  monthly: { month: string; output: number; input: number; net: number; taxableSales: number; taxablePurchases: number }[];
  uninvoicedPurchases: number;
};

export function TaxReport({ period, branchId }: Scope) {
  const state = useReport<TaxData>("tax", { from: period.from, to: period.to, branchId });
  return (
    <Frame state={state}>
      {(d) => (
        <>
          <KpiRow>
            <Kpi label="Output tax (on sales)" value={rs(d.totals.output)} />
            <Kpi label="Input tax (on purchases)" value={rs(d.totals.input)} />
            <Kpi tone="dark" label={d.totals.net >= 0 ? "Net tax payable" : "Net tax refundable"} value={rs(Math.abs(d.totals.net))} />
            <Kpi label="Taxable sales" value={rs(d.outputByRate.filter((r) => r.rate > 0).reduce((t, r) => t + r.taxable, 0))} />
          </KpiRow>
          {d.uninvoicedPurchases > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {d.uninvoicedPurchases} stock-in entries in this period have no supplier invoice, so their input tax isn&apos;t counted. Record supplier invoices to claim it.
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Output tax by rate">
              <DataTable
                rows={d.outputByRate}
                rowKey={(r) => String(r.rate)}
                exportName="output-tax"
                columns={[
                  { key: "rate", label: "Rate", render: (r) => (r.rate ? `${r.rate}%` : "Exempt / 0%") },
                  { key: "lines", label: "Lines", align: "right" },
                  { key: "taxable", label: "Taxable value", align: "right", render: (r) => rs(r.taxable) },
                  { key: "tax", label: "Tax", align: "right", render: (r) => rs(r.tax) },
                ]}
              />
            </Card>
            <Card title="Month by month">
              <DataTable
                rows={d.monthly}
                rowKey={(r) => r.month}
                exportName="tax-monthly"
                columns={[
                  { key: "month", label: "Month" },
                  { key: "output", label: "Output", align: "right", render: (r) => rs(r.output) },
                  { key: "input", label: "Input", align: "right", render: (r) => rs(r.input) },
                  { key: "net", label: "Net payable", align: "right", render: (r) => <b>{rs(r.net)}</b> },
                ]}
              />
            </Card>
          </div>
          <Card title="Input tax — supplier invoices">
            <DataTable
              rows={d.inputInvoices}
              rowKey={(r) => r.id}
              search={(r) => `${r.invoiceNumber} ${r.supplier}`}
              exportName="input-tax"
              columns={[
                { key: "date", label: "Date", render: (r) => day(r.date) },
                { key: "invoiceNumber", label: "Invoice" },
                { key: "supplier", label: "Supplier" },
                { key: "ntn", label: "NTN / STRN", value: (r) => r.ntn ?? "" },
                { key: "taxable", label: "Taxable", align: "right", render: (r) => rs(r.taxable) },
                { key: "tax", label: "Tax", align: "right", render: (r) => rs(r.tax) },
                { key: "total", label: "Total", align: "right", render: (r) => rs(r.total) },
              ]}
            />
          </Card>
        </>
      )}
    </Frame>
  );
}
