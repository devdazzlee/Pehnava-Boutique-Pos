"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  Loader2,
  Package,
  Percent,
  RefreshCcw,
  Search,
  ShoppingBag,
  Wallet,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { formatMoney } from "@/components/inventory/stock-ops/export-utils";
import { useToast } from "@/hooks/use-toast";
import { extractApiError } from "@/lib/api/errors";
import { useEmployees } from "@/hooks/queries/use-employees";
import {
  fetchCommissions,
  generateCommissions,
  markCommissionPaid,
  markCommissionUnpaid,
  fetchCommissionSales,
  previewCommissions,
  type CommissionRecord,
  type CommissionSaleLine,
  type CommissionPreviewRow,
} from "@/lib/api/commissions";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => currentYear - i);
const PAGE_SIZE = 20;

type PaidFilter = "all" | "paid" | "unpaid";

const formatPeriod = (month: number, year: number) =>
  `${MONTHS[month - 1] || month} ${year}`;

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy");
};

const qty = (value: number) =>
  Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

export function Commissions() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
  const [monthFilter, setMonthFilter] = useState(String(new Date().getMonth() + 1));
  const [yearFilter, setYearFilter] = useState(String(currentYear));
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CommissionRecord[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: PAGE_SIZE, totalPages: 1 });
  const [summary, setSummary] = useState({
    totalCommission: 0,
    paidAmount: 0,
    unpaidAmount: 0,
    outstanding: 0,
    paidCount: 0,
    unpaidCount: 0,
    totalPieces: 0,
    totalSales: 0,
    employeeCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const [detail, setDetail] = useState<CommissionRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [sales, setSales] = useState<CommissionSaleLine[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesSummary, setSalesSummary] = useState({ bills: 0, pieces: 0, salesAmount: 0 });

  const [previewRows, setPreviewRows] = useState<CommissionPreviewRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [linkEmployeeId, setLinkEmployeeId] = useState("");
  const [linkUserId, setLinkUserId] = useState("");
  const [linkRate, setLinkRate] = useState("0");
  const [posUsers, setPosUsers] = useState<
    Array<{ id: string; email: string; role: string; employee?: { id: string; name: string } | null }>
  >([]);
  const [linking, setLinking] = useState(false);

  const { employees: employeeRows } = useEmployees({ limit: 100 });
  const employees = useMemo(
    () =>
      (employeeRows as Array<{
        id: string;
        name: string;
        employee_code?: string | null;
        status?: string;
        commission_rate?: number;
        user_id?: string | null;
      }>).filter((e) => (e.status || "ACTIVE") !== "TERMINATED"),
    [employeeRows],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchCommissions({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        isPaid:
          paidFilter === "paid" ? true : paidFilter === "unpaid" ? false : undefined,
        month: monthFilter !== "all" ? monthFilter : undefined,
        year: yearFilter !== "all" ? yearFilter : undefined,
        employeeId: employeeFilter !== "all" ? employeeFilter : undefined,
      });
      setRows(result.data);
      setMeta(result.meta);
      if (result.summary) setSummary(result.summary);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not load commissions",
        description: extractApiError(error, "Try again"),
      });
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, paidFilter, monthFilter, yearFilter, employeeFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    apiClient
      .get("/employee/pos-users")
      .then((res) => setPosUsers(Array.isArray(res.data?.data) ? res.data.data : []))
      .catch(() => setPosUsers([]));
  }, []);

  const loadPreview = async () => {
    if (monthFilter === "all" || yearFilter === "all") {
      toast({
        variant: "destructive",
        title: "Select month and year",
        description: "Preview needs a specific month/year.",
      });
      return;
    }
    const month = Number(monthFilter);
    const year = Number(yearFilter);
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    setPreviewLoading(true);
    try {
      const data = await previewCommissions({
        from,
        to,
        employeeId: employeeFilter !== "all" ? employeeFilter : undefined,
      });
      setPreviewRows(data.rows || []);
      toast({
        title: "Live sales preview ready",
        description: `${data.summary.employeeCount} employees · ${qty(data.summary.totalPieces)} pieces`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Preview failed",
        description: extractApiError(error, "Link POS users on employees first"),
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (monthFilter === "all" || yearFilter === "all") {
      toast({
        variant: "destructive",
        title: "Select month and year to generate",
      });
      return;
    }
    setGenerating(true);
    try {
      const result = await generateCommissions({
        month: Number(monthFilter),
        year: Number(yearFilter),
        employee_id: employeeFilter !== "all" ? employeeFilter : undefined,
        overwrite: true,
      });
      toast({
        title: "Commission records generated",
        description: `${result.count} employee period(s) saved`,
      });
      await load();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not generate",
        description: extractApiError(
          error,
          "Link each sales staff employee to their POS login user first",
        ),
      });
    } finally {
      setGenerating(false);
    }
  };

  const openDetail = async (row: CommissionRecord) => {
    setDetail(row);
    setDetailOpen(true);
    setSalesLoading(true);
    try {
      const data = await fetchCommissionSales(row.id);
      setSales(data.sales || []);
      setSalesSummary(data.summary);
    } catch {
      setSales([]);
      setSalesSummary({ bills: 0, pieces: 0, salesAmount: 0 });
    } finally {
      setSalesLoading(false);
    }
  };

  const handleMarkPaid = async (row: CommissionRecord) => {
    setActionId(row.id);
    try {
      await markCommissionPaid(row.id);
      toast({ title: "Commission marked paid" });
      await load();
      if (detail?.id === row.id) {
        setDetail({ ...row, is_paid: true, paid_date: new Date().toISOString() });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: extractApiError(error, "Could not mark paid"),
      });
    } finally {
      setActionId(null);
    }
  };

  const handleMarkUnpaid = async (row: CommissionRecord) => {
    setActionId(row.id);
    try {
      await markCommissionUnpaid(row.id);
      toast({ title: "Commission marked unpaid" });
      await load();
      if (detail?.id === row.id) {
        setDetail({ ...row, is_paid: false, paid_date: null });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: extractApiError(error, "Could not mark unpaid"),
      });
    } finally {
      setActionId(null);
    }
  };

  const handleLink = async () => {
    if (!linkEmployeeId) {
      toast({ variant: "destructive", title: "Select an employee" });
      return;
    }
    setLinking(true);
    try {
      await apiClient.put(`/employee/${linkEmployeeId}`, {
        user_id: linkUserId && linkUserId !== "none" ? linkUserId : null,
        commission_rate: Number(linkRate || 0),
      });
      toast({ title: "Employee commission settings saved" });
      setLinkEmployeeId("");
      setLinkUserId("");
      setLinkRate("0");
      const usersRes = await apiClient.get("/employee/pos-users");
      setPosUsers(Array.isArray(usersRes.data?.data) ? usersRes.data.data : []);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not save link",
        description: extractApiError(error, "Try again"),
      });
    } finally {
      setLinking(false);
    }
  };

  useEffect(() => {
    if (!linkEmployeeId) return;
    const emp = employees.find((e) => e.id === linkEmployeeId);
    if (emp) {
      setLinkUserId(emp.user_id || "none");
      setLinkRate(String(emp.commission_rate ?? 0));
    }
  }, [linkEmployeeId, employees]);

  return (
    <>
      <PageHeader
        title="Commission Management"
        description="Track sales commission by employee — pieces sold, bills, paid vs outstanding"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadPreview}
              disabled={previewLoading}
            >
              {previewLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Preview sales
            </Button>
            <Button size="sm" onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Generate period
            </Button>
          </>
        }
      />

      <PageBody className="space-y-5">
        <InventoryKpiGrid
          columns={5}
          loading={loading && rows.length === 0}
          items={[
            {
              label: "Total commission",
              value: formatMoney(summary.totalCommission),
              icon: Percent,
              hint: `${summary.employeeCount} employees`,
            },
            {
              label: "Total paid",
              value: formatMoney(summary.paidAmount),
              icon: CheckCircle2,
              tone: "success",
              hint: `${summary.paidCount} paid`,
              onClick: () => {
                setPaidFilter("paid");
                setPage(1);
              },
            },
            {
              label: "Unpaid / outstanding",
              value: formatMoney(summary.outstanding || summary.unpaidAmount),
              icon: XCircle,
              tone: "danger",
              hint: `${summary.unpaidCount} unpaid`,
              onClick: () => {
                setPaidFilter("unpaid");
                setPage(1);
              },
            },
            {
              label: "Pieces sold",
              value: qty(summary.totalPieces),
              icon: Package,
              hint: "Net qty in period records",
            },
            {
              label: "Sales amount",
              value: formatMoney(summary.totalSales),
              icon: ShoppingBag,
              hint: "From linked cashier sales",
            },
          ]}
        />

        <Card>
          <CardContent className="space-y-3 p-4">
            <div>
              <p className="text-sm font-semibold">Link POS user + commission %</p>
              <p className="text-xs text-muted-foreground">
                Sales are recorded under login users. Link each employee to their POS account and set
                commission rate so pieces & bills count correctly.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Employee</Label>
                <Select value={linkEmployeeId} onValueChange={setLinkEmployeeId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                        {e.employee_code ? ` (${e.employee_code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">POS login user</Label>
                <Select value={linkUserId} onValueChange={setLinkUserId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked</SelectItem>
                    {posUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id} disabled={!!u.employee && u.employee.id !== linkEmployeeId}>
                        {u.email}
                        {u.employee ? ` → ${u.employee.name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Commission %</Label>
                <Input
                  className="h-9"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={linkRate}
                  onChange={(e) => setLinkRate(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button className="h-9 w-full" onClick={handleLink} disabled={linking || !linkEmployeeId}>
                  {linking ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Save link
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 xl:flex-row xl:flex-wrap xl:items-center">
          <div className="relative max-w-md min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9"
              placeholder="Search employee name or code"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={paidFilter}
            onValueChange={(v) => {
              setPaidFilter(v as PaidFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={monthFilter}
            onValueChange={(v) => {
              setMonthFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={yearFilter}
            onValueChange={(v) => {
              setYearFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={employeeFilter}
            onValueChange={(v) => {
              setEmployeeFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue placeholder="Employee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                  {e.employee_code ? ` (${e.employee_code})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {previewRows.length > 0 ? (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <div className="border-b px-4 py-3 text-sm font-semibold">
                Live sales preview (not saved yet)
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Bills</TableHead>
                    <TableHead className="text-right">Pieces</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row) => (
                    <TableRow key={row.employeeId}>
                      <TableCell>
                        <div className="font-medium">{row.employee}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.code || "—"} · {row.userEmail || "no user"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{row.bills}</TableCell>
                      <TableCell className="text-right">{qty(row.pieces)}</TableCell>
                      <TableCell className="text-right">{formatMoney(row.salesAmount)}</TableCell>
                      <TableCell className="text-right">{row.rate}%</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.commissionAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3 text-sm font-semibold">
              Commission records ({meta.total})
            </div>
            {loading && rows.length === 0 ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="m-4 rounded-lg border border-dashed py-12 text-center">
                <Wallet className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No commission records yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Link POS users, set %, then click Generate period
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Bills</TableHead>
                      <TableHead className="text-right">Pieces</TableHead>
                      <TableHead className="text-right">Sales</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Paid date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">{row.employee?.name || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.employee?.employee_code || "—"}
                            {row.employee?.employee_type?.name
                              ? ` · ${row.employee.employee_type.name}`
                              : ""}
                          </div>
                        </TableCell>
                        <TableCell>{formatPeriod(row.month, row.year)}</TableCell>
                        <TableCell className="text-right">{row.bills}</TableCell>
                        <TableCell className="text-right">{qty(row.pieces)}</TableCell>
                        <TableCell className="text-right">{formatMoney(row.sales_amount)}</TableCell>
                        <TableCell className="text-right">{row.rate}%</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatMoney(row.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              row.is_paid
                                ? "border-green-200 bg-green-50 text-green-700"
                                : "border-amber-200 bg-amber-50 text-amber-800"
                            }
                          >
                            {row.is_paid ? "Paid" : "Unpaid"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(row.paid_date)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() => openDetail(row)}
                            >
                              Details
                            </Button>
                            {row.is_paid ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                disabled={actionId === row.id}
                                onClick={() => handleMarkUnpaid(row)}
                              >
                                Unpaid
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                disabled={actionId === row.id}
                                onClick={() => handleMarkPaid(row)}
                              >
                                Mark paid
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {meta.totalPages > 1 ? (
              <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  Page {meta.page} of {meta.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= meta.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </PageBody>

      <DetailSheet
        open={detailOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDetailOpen(false);
            setDetail(null);
            setSales([]);
          }
        }}
        size="lg"
      >
        <DetailSheetHeader
          title={detail?.employee?.name || "Commission"}
          subtitle={detail ? formatPeriod(detail.month, detail.year) : undefined}
          icon={<Percent className="h-5 w-5" />}
        />
        <DetailSheetBody className="space-y-4">
          {detail ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Code</p>
                  <p className="font-medium">{detail.employee?.employee_code || "—"}</p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-xs text-muted-foreground">POS user</p>
                  <p className="font-medium">{detail.employee?.user?.email || "Not linked"}</p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Bills / pieces</p>
                  <p className="font-medium">
                    {detail.bills} bills · {qty(detail.pieces)} pcs
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Sales → commission</p>
                  <p className="font-medium">
                    {formatMoney(detail.sales_amount)} @ {detail.rate}% ={" "}
                    <span className="font-bold">{formatMoney(detail.amount)}</span>
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">
                  Sales in this period{" "}
                  <span className="font-normal text-muted-foreground">
                    ({salesSummary.bills} bills · {qty(salesSummary.pieces)} pcs ·{" "}
                    {formatMoney(salesSummary.salesAmount)})
                  </span>
                </p>
                {salesLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : sales.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No sales found. Ensure this employee is linked to the POS user who made the sales.
                  </p>
                ) : (
                  <div className="max-h-[360px] space-y-2 overflow-y-auto">
                    {sales.map((sale) => (
                      <div key={sale.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{sale.voucher}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(sale.date)} · {sale.customer} · {sale.status}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{formatMoney(sale.salesAmount)}</p>
                            <p className="text-xs text-muted-foreground">{qty(sale.pieces)} pcs</p>
                          </div>
                        </div>
                        <div className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                          {sale.items.slice(0, 4).map((item, idx) => (
                            <div key={`${sale.id}-${idx}`} className="flex justify-between gap-2">
                              <span className="truncate">
                                {item.product} ({item.sku})
                              </span>
                              <span className="shrink-0">
                                {qty(item.quantity)} · {formatMoney(item.amount)}
                              </span>
                            </div>
                          ))}
                          {sale.items.length > 4 ? (
                            <p>+{sale.items.length - 4} more items</p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </DetailSheetBody>
        <DetailSheetFooter>
          {detail ? (
            detail.is_paid ? (
              <Button
                variant="outline"
                disabled={actionId === detail.id}
                onClick={() => handleMarkUnpaid(detail)}
              >
                Mark unpaid
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={actionId === detail.id}
                onClick={() => handleMarkPaid(detail)}
              >
                Mark paid
              </Button>
            )
          ) : null}
        </DetailSheetFooter>
      </DetailSheet>
    </>
  );
}
