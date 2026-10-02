"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { format } from "date-fns";
import {
  BookOpenText,
  Building2,
  ChevronDown,
  ChevronRight,
  Coins,
  FolderOpen,
  FolderPlus,
  Link2,
  Loader2,
  Lock,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Receipt,
  SearchX,
  Trash2,
  TrendingDown,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AccountDialog, ConfirmDialog, ControlDialog, QuickExpenseDialog, SubTypeDialog } from "./coa-dialogs";
import { Chips, EmptyState, FilterBar, SearchBox, StatTile } from "./coa-ui";
import {
  KIND_LABEL,
  KIND_STYLE,
  LINK_LABEL,
  TYPE_STYLE,
  apiError,
  balanceLabel,
  coaApi,
  flattenAccounts,
  includesText,
  money,
  moneyOrDash,
  naturalAmount,
  type CoaAccount,
  type CoaControl,
  type CoaFilters,
  type CoaSubType,
  type CoaTree,
} from "./coa-shared";

type DeleteTarget =
  | { kind: "sub"; item: CoaSubType }
  | { kind: "control"; item: CoaControl }
  | { kind: "account"; item: CoaAccount };

type ShowFilter = "all" | "balance" | "linked" | "manual" | "system" | "inactive";
/** What the right-hand table lists: a whole type, one sub type, or one control account. */
type Scope = { kind: "type" } | { kind: "sub"; id: string } | { kind: "control"; id: string };

const TYPE_ICON: Record<number, ComponentType<{ className?: string }>> = {
  1: Wallet,
  2: Building2,
  3: Coins,
  4: TrendingUp,
  5: TrendingDown,
};

const TYPE_HELP: Record<number, string> = {
  1: "What the business owns",
  2: "What the business owes",
  3: "Owner's investment",
  4: "Money earned",
  5: "Money spent",
};

const hasActivity = (a: CoaAccount) =>
  !!a.balance && (Math.abs(a.balance.closing) > 0.005 || a.balance.debit > 0.005 || a.balance.credit > 0.005);

const matchesShow = (a: CoaAccount, show: ShowFilter) => {
  if (show === "inactive") return !a.is_active;
  if (!a.is_active) return false;
  if (show === "balance") return hasActivity(a);
  if (show === "linked") return !!a.link;
  if (show === "manual") return !a.link && !a.is_system;
  if (show === "system") return a.is_system;
  return true;
};

export function CoaExplorer({
  tree,
  filters,
  reload,
  canManage,
  canApprove,
  onOpenLedger,
  createRequest,
}: {
  tree: CoaTree;
  filters: CoaFilters;
  reload: () => void;
  canManage: boolean;
  canApprove: boolean;
  onOpenLedger: (accountId: string) => void;
  createRequest?: { kind: "sub" | "control" | "account"; n: number } | null;
}) {
  const { toast } = useToast();
  const [typeCode, setTypeCode] = useState<number>(5);
  const [scope, setScope] = useState<Scope>({ kind: "type" });
  const [collapsedSubs, setCollapsedSubs] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<ShowFilter>("all");
  const [searchAll, setSearchAll] = useState(false);

  const [subDialog, setSubDialog] = useState<{ open: boolean; editing: CoaSubType | null }>({ open: false, editing: null });
  const [controlDialog, setControlDialog] = useState<{ open: boolean; editing: CoaControl | null; subId?: string }>({ open: false, editing: null });
  const [accountDialog, setAccountDialog] = useState<{ open: boolean; editing: CoaAccount | null; controlId?: string }>({ open: false, editing: null });
  const [expenseFor, setExpenseFor] = useState<CoaAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const type = tree.types.find((t) => t.code === typeCode) ?? tree.types[0];
  const allAccounts = useMemo(() => flattenAccounts(tree), [tree]);
  const allControls = useMemo(() => tree.types.flatMap((t) => t.subTypes.flatMap((s) => s.controls)), [tree]);
  const allSubTypes = useMemo(() => tree.types.flatMap((t) => t.subTypes), [tree]);
  const detail = allAccounts.find((a) => a.id === detailId) ?? null;

  const scopedSub = scope.kind === "sub" ? allSubTypes.find((s) => s.id === scope.id) ?? null : null;
  const scopedControl = scope.kind === "control" ? allControls.find((c) => c.id === scope.id) ?? null : null;
  const controlSub = scopedControl ? allSubTypes.find((s) => s.id === scopedControl.sub_type_id) ?? null : null;

  // Reset to the whole type if the selected node disappeared after a reload.
  useEffect(() => {
    if ((scope.kind === "sub" && !scopedSub) || (scope.kind === "control" && !scopedControl)) setScope({ kind: "type" });
  }, [scope, scopedSub, scopedControl]);

  useEffect(() => {
    if (!createRequest || !canManage) return;
    if (createRequest.kind === "sub") setSubDialog({ open: true, editing: null });
    if (createRequest.kind === "control") setControlDialog({ open: true, editing: null, subId: scopedSub?.id ?? controlSub?.id });
    if (createRequest.kind === "account") setAccountDialog({ open: true, editing: null, controlId: scopedControl?.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRequest, canManage]);

  const scopeAccounts = useMemo(() => {
    if (searchAll && search.trim()) return allAccounts;
    if (scopedControl) return scopedControl.accounts;
    if (scopedSub) return scopedSub.controls.flatMap((c) => c.accounts);
    return type ? type.subTypes.flatMap((s) => s.controls.flatMap((c) => c.accounts)) : [];
  }, [searchAll, search, allAccounts, scopedControl, scopedSub, type]);

  const showCounts = useMemo(() => {
    const counts: Record<ShowFilter, number> = { all: 0, balance: 0, linked: 0, manual: 0, system: 0, inactive: 0 };
    for (const a of scopeAccounts) (Object.keys(counts) as ShowFilter[]).forEach((k) => matchesShow(a, k) && (counts[k] += 1));
    return counts;
  }, [scopeAccounts]);

  const rows = useMemo(
    () =>
      scopeAccounts
        .filter((a) => matchesShow(a, show))
        .filter((a) => a.code.startsWith(search.trim()) || includesText([a.name, a.contact_person, a.mobile, a.link?.name, a.control.name], search)),
    [scopeAccounts, show, search],
  );

  const groupedRows = useMemo(() => {
    const map = new Map<string, { control: CoaAccount["control"]; subName: string; rows: CoaAccount[] }>();
    for (const a of rows) {
      const g = map.get(a.control_id) || { control: a.control, subName: a.sub_type.name, rows: [] };
      g.rows.push(a);
      map.set(a.control_id, g);
    }
    return [...map.values()];
  }, [rows]);

  const scopeTotal = rows.reduce((s, a) => s + (a.balance?.closing ?? 0), 0);
  const scopeTitle = searchAll && search.trim() ? "Search results" : scopedControl?.name ?? scopedSub?.name ?? `All ${type?.name.toLowerCase()} accounts`;
  const scopeCode = searchAll && search.trim() ? null : scopedControl?.code ?? scopedSub?.code ?? String(typeCode);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === "sub") await coaApi.deleteSubType(deleteTarget.item.id);
      else if (deleteTarget.kind === "control") await coaApi.deleteControl(deleteTarget.item.id);
      else await coaApi.deleteAccount(deleteTarget.item.id);
      if (deleteTarget.kind === "account") setDetailId(null);
      else setScope({ kind: "type" });
      toast({ title: "Deleted", description: `${deleteTarget.item.code} · ${deleteTarget.item.name}` });
      reload();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not delete", description: apiError(error) });
      throw error;
    }
  };

  const toggleSub = (id: string) =>
    setCollapsedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const accountMenu = (a: CoaAccount) => [
    { label: "View details", icon: FolderOpen, onClick: () => setDetailId(a.id) },
    { label: "Open ledger", icon: BookOpenText, onClick: () => onOpenLedger(a.id) },
    ...(a.type_code === 5 && !a.computed && a.link?.kind !== "EMPLOYEE" && a.is_active
      ? [{ label: "Record expense", icon: Receipt, onClick: () => setExpenseFor(a) }]
      : []),
    ...(canManage ? [{ label: "Edit account", icon: Pencil, onClick: () => setAccountDialog({ open: true, editing: a }) }] : []),
    ...(canManage && !a.is_system && !a.link
      ? [{ label: "Delete account", icon: Trash2, danger: true, onClick: () => setDeleteTarget({ kind: "account", item: a }) }]
      : []),
  ];

  return (
    <div className="space-y-4">
      {/* ---------- level 1: account types ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {tree.types.map((t) => {
          const Icon = TYPE_ICON[t.code];
          const active = t.code === typeCode;
          const accountCount = t.subTypes.reduce((s, x) => s + x.controls.reduce((n, c) => n + c.accounts.filter((a) => a.is_active).length, 0), 0);
          return (
            <button
              key={t.code}
              type="button"
              onClick={() => {
                setTypeCode(t.code);
                setScope({ kind: "type" });
                setSearchAll(false);
              }}
              className={cn(
                "group relative overflow-hidden rounded-xl border bg-white p-4 text-left shadow-sm transition-all",
                active ? "border-[#a67c2e] ring-2 ring-[#a67c2e]/20" : "border-gray-200/80 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg border", TYPE_STYLE[t.code].badge)}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-500">{t.code}</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-gray-900">{t.name}</p>
              <p className="text-[11px] text-gray-500">{TYPE_HELP[t.code]}</p>
              <p className="mt-2 text-lg font-bold tabular-nums text-gray-900">{money(Math.abs(naturalAmount(t.totals.closing, t.code)))}</p>
              <p className="text-[11px] text-gray-400">
                {t.subTypes.length} sub types · {accountCount} accounts
              </p>
              {active ? <span className="absolute inset-x-0 bottom-0 h-1 bg-[#a67c2e]" /> : null}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ---------- levels 2 & 3: structure tree ---------- */}
        <aside className="h-fit overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm lg:sticky lg:top-4">
          <header className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-gray-900">{type?.name} structure</h3>
              <p className="text-[11px] text-gray-500">Sub types and their control accounts</p>
            </div>
            {canManage ? (
              <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-[#8a6520] hover:bg-[#fcf8f2]" onClick={() => setSubDialog({ open: true, editing: null })}>
                <Plus className="mr-1 h-3.5 w-3.5" />Sub type
              </Button>
            ) : null}
          </header>

          <nav className="max-h-[calc(100vh-220px)] overflow-y-auto p-2">
            <TreeItem
              depth={0}
              active={scope.kind === "type" && !searchAll}
              label={`All ${type?.name.toLowerCase()} accounts`}
              amount={balanceLabel(type?.totals.closing ?? 0, typeCode)}
              onClick={() => {
                setScope({ kind: "type" });
                setSearchAll(false);
              }}
            />
            {(type?.subTypes ?? []).map((s) => {
              const open = !collapsedSubs.has(s.id);
              return (
                <div key={s.id} className="mt-1">
                  <TreeItem
                    depth={0}
                    code={s.code}
                    label={s.name}
                    meta={`${s.controls.length} control account${s.controls.length === 1 ? "" : "s"}`}
                    amount={balanceLabel(s.totals.closing, s.type_code)}
                    active={scope.kind === "sub" && scope.id === s.id && !searchAll}
                    locked={s.is_system}
                    muted={!s.is_active}
                    bold
                    expander={{ open, onToggle: () => toggleSub(s.id) }}
                    onClick={() => {
                      setScope({ kind: "sub", id: s.id });
                      setSearchAll(false);
                    }}
                    menu={
                      canManage
                        ? [
                            { label: "Add control account", icon: FolderPlus, onClick: () => setControlDialog({ open: true, editing: null, subId: s.id }) },
                            { label: "Edit sub type", icon: Pencil, onClick: () => setSubDialog({ open: true, editing: s }) },
                            ...(!s.is_system ? [{ label: "Delete sub type", icon: Trash2, danger: true, onClick: () => setDeleteTarget({ kind: "sub", item: s }) }] : []),
                          ]
                        : undefined
                    }
                  />
                  {open ? (
                    <div className="ml-4 border-l border-gray-100 pl-1">
                      {s.controls.length === 0 ? (
                        <p className="px-3 py-2 text-[11px] text-gray-400">No control accounts</p>
                      ) : (
                        s.controls.map((c) => (
                          <TreeItem
                            key={c.id}
                            depth={1}
                            code={c.code}
                            label={c.name}
                            meta={`${c.accounts.filter((a) => a.is_active).length} accounts`}
                            amount={balanceLabel(c.totals.closing, s.type_code)}
                            active={scope.kind === "control" && scope.id === c.id && !searchAll}
                            locked={c.is_system}
                            muted={!c.is_active}
                            onClick={() => {
                              setScope({ kind: "control", id: c.id });
                              setSearchAll(false);
                            }}
                            menu={
                              canManage
                                ? [
                                    { label: "Add account here", icon: Plus, onClick: () => setAccountDialog({ open: true, editing: null, controlId: c.id }) },
                                    { label: "Edit control account", icon: Pencil, onClick: () => setControlDialog({ open: true, editing: c }) },
                                    ...(!c.is_system ? [{ label: "Delete control account", icon: Trash2, danger: true, onClick: () => setDeleteTarget({ kind: "control", item: c }) }] : []),
                                  ]
                                : undefined
                            }
                          />
                        ))
                      )}
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => setControlDialog({ open: true, editing: null, subId: s.id })}
                          className="mt-0.5 flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-gray-400 hover:bg-gray-50 hover:text-[#8a6520]"
                        >
                          <Plus className="h-3 w-3" />Add control account
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* ---------- level 4: transactional accounts ---------- */}
        <section className="min-w-0 overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
          <header className="flex flex-wrap items-start gap-3 border-b border-gray-100 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
                <span>{type?.name}</span>
                {controlSub ? (
                  <>
                    <ChevronRight className="h-3 w-3" />
                    <span>{controlSub.name}</span>
                  </>
                ) : null}
              </p>
              <h3 className="mt-0.5 flex flex-wrap items-center gap-2 text-lg font-semibold text-gray-900">
                {scopeCode ? <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-xs font-normal text-gray-500">{scopeCode}</span> : null}
                {scopeTitle}
              </h3>
              <p className="text-xs text-gray-500">
                {rows.length} account{rows.length === 1 ? "" : "s"} · balance{" "}
                <span className="font-semibold text-gray-800">{balanceLabel(scopeTotal, typeCode)}</span>
              </p>
            </div>
            {canManage ? (
              <Button
                size="sm"
                className="h-9 bg-[#2a2012] hover:bg-[#3b2e1a]"
                onClick={() => setAccountDialog({ open: true, editing: null, controlId: scopedControl?.id })}
              >
                <Plus className="mr-1.5 h-4 w-4" />Add account
              </Button>
            ) : null}
          </header>

          <FilterBar>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder={searchAll ? "Search every account…" : "Search code, name, contact, mobile…"}
              className="max-w-sm"
            />
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" className="h-3.5 w-3.5 accent-[#2a2012]" checked={searchAll} onChange={(e) => setSearchAll(e.target.checked)} />
              Search all types
            </label>
          </FilterBar>
          <FilterBar className="bg-white">
            <Chips<ShowFilter>
              size="xs"
              value={show}
              onChange={setShow}
              options={[
                { value: "all", label: "Active", count: showCounts.all },
                { value: "balance", label: "With balance", count: showCounts.balance },
                { value: "linked", label: "Linked", count: showCounts.linked },
                { value: "manual", label: "Manual", count: showCounts.manual },
                { value: "system", label: "System", count: showCounts.system },
                { value: "inactive", label: "Inactive", count: showCounts.inactive },
              ]}
            />
          </FilterBar>

          {rows.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={scopeAccounts.length ? "No accounts match these filters" : "No accounts here yet"}
              description={scopeAccounts.length ? "Clear the search or choose another filter." : "Add the first account to start posting to it."}
              action={
                scopeAccounts.length ? (
                  <Button size="sm" variant="outline" onClick={() => { setSearch(""); setShow("all"); }}>
                    Clear filters
                  </Button>
                ) : canManage ? (
                  <Button size="sm" className="bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={() => setAccountDialog({ open: true, editing: null, controlId: scopedControl?.id })}>
                    <Plus className="mr-1 h-4 w-4" />Add account
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <th className="w-28 px-5 py-2.5">Code</th>
                    <th className="px-3 py-2.5">Account</th>
                    <th className="w-20 px-3 py-2.5 text-center">Postings</th>
                    <th className="w-32 px-3 py-2.5 text-right">Debit</th>
                    <th className="w-32 px-3 py-2.5 text-right">Credit</th>
                    <th className="w-36 px-3 py-2.5 text-right">Balance</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.map((g) => (
                    <GroupRows
                      key={g.control.id}
                      showHeader={!scopedControl || (searchAll && !!search.trim())}
                      group={g}
                      onSelect={(a) => setDetailId(a.id)}
                      menuFor={accountMenu}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* ---------- details drawer ---------- */}
      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetailId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
          {detail ? (
            <AccountDetail
              account={detail}
              filters={filters}
              canManage={canManage}
              onEdit={() => setAccountDialog({ open: true, editing: detail })}
              onDelete={() => setDeleteTarget({ kind: "account", item: detail })}
              onLedger={() => {
                setDetailId(null);
                onOpenLedger(detail.id);
              }}
              onExpense={() => setExpenseFor(detail)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <SubTypeDialog
        open={subDialog.open}
        onOpenChange={(open) => setSubDialog((s) => ({ ...s, open }))}
        typeCode={typeCode}
        types={tree.types}
        editing={subDialog.editing}
        onSaved={reload}
      />
      <ControlDialog
        open={controlDialog.open}
        onOpenChange={(open) => setControlDialog((s) => ({ ...s, open }))}
        subType={allSubTypes.find((s) => s.id === controlDialog.subId) ?? scopedSub ?? controlSub ?? type?.subTypes[0] ?? null}
        subTypes={allSubTypes}
        editing={controlDialog.editing}
        onSaved={reload}
      />
      <AccountDialog
        open={accountDialog.open}
        onOpenChange={(open) => setAccountDialog((s) => ({ ...s, open }))}
        control={allControls.find((c) => c.id === accountDialog.controlId) ?? scopedControl}
        types={tree.types}
        editing={accountDialog.editing}
        onSaved={(saved) => {
          setTypeCode(saved.type_code);
          setScope({ kind: "control", id: saved.control_id });
          setDetailId(saved.id);
          reload();
        }}
      />
      <QuickExpenseDialog
        open={!!expenseFor}
        onOpenChange={(open) => !open && setExpenseFor(null)}
        account={expenseFor}
        canApprove={canApprove}
        onSaved={reload}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.kind === "sub" ? "sub type" : deleteTarget?.kind === "control" ? "control account" : "account"}?`}
        description={
          <>
            <span className="font-mono">{deleteTarget?.item.code}</span> {deleteTarget?.item.name} will be removed permanently. Accounts with
            postings cannot be deleted — deactivate them instead.
          </>
        }
        onConfirm={confirmDelete}
      />
    </div>
  );
}

/* ------------------------------ tree ------------------------------ */

type MenuItem = { label: string; icon: ComponentType<{ className?: string }>; onClick: () => void; danger?: boolean };

function RowMenu({ items, visible }: { items: MenuItem[]; visible?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Actions"
          className={cn(
            "shrink-0 rounded-md p-1 text-gray-400 transition-opacity hover:bg-gray-200 hover:text-gray-700 focus:opacity-100",
            visible ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {items.map((item, i) => (
          <div key={item.label}>
            {item.danger && i > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onClick={item.onClick} className={item.danger ? "text-rose-600 focus:text-rose-700" : undefined}>
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TreeItem({
  depth,
  code,
  label,
  meta,
  amount,
  active,
  locked,
  muted,
  bold,
  expander,
  onClick,
  menu,
}: {
  depth: number;
  code?: string;
  label: string;
  meta?: string;
  amount: string;
  active: boolean;
  locked?: boolean;
  muted?: boolean;
  bold?: boolean;
  expander?: { open: boolean; onToggle: () => void };
  onClick: () => void;
  menu?: MenuItem[];
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      className={cn(
        "group relative flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 outline-none transition-colors",
        active ? "bg-[#2a2012] text-white" : "hover:bg-gray-50 focus-visible:bg-gray-50",
        muted && !active && "opacity-55",
      )}
    >
      {expander ? (
        <button
          type="button"
          aria-label={expander.open ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.stopPropagation();
            expander.onToggle();
          }}
          className={cn("mt-0.5 rounded p-0.5", active ? "text-white/70 hover:bg-white/10" : "text-gray-400 hover:bg-gray-200")}
        >
          {expander.open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      ) : depth === 0 ? (
        <span className="w-[18px]" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className={cn("flex flex-wrap items-baseline gap-x-1.5 text-[13px] leading-snug", bold ? "font-semibold" : "font-medium")}>
          {code ? <span className={cn("font-mono text-[11px] font-normal", active ? "text-[#e9d3a4]" : "text-gray-400")}>{code}</span> : null}
          <span className="break-words">{label}</span>
          {locked ? <Lock className={cn("h-3 w-3 self-center", active ? "text-white/50" : "text-gray-300")} aria-label="System" /> : null}
        </span>
        {meta ? <span className={cn("block text-[11px]", active ? "text-white/60" : "text-gray-400")}>{meta}</span> : null}
      </span>
      <span className={cn("mt-0.5 whitespace-nowrap text-xs font-semibold tabular-nums", active ? "text-white" : "text-gray-700")}>{amount}</span>
      {menu && menu.length ? <RowMenu items={menu} visible={active} /> : null}
    </div>
  );
}

/* ------------------------------ table ------------------------------ */

function GroupRows({
  group,
  showHeader,
  onSelect,
  menuFor,
}: {
  group: { control: CoaAccount["control"]; subName: string; rows: CoaAccount[] };
  showHeader: boolean;
  onSelect: (a: CoaAccount) => void;
  menuFor: (a: CoaAccount) => MenuItem[];
}) {
  const total = group.rows.reduce((s, a) => s + (a.balance?.closing ?? 0), 0);
  const typeCode = group.rows[0]?.type_code ?? 1;
  return (
    <>
      {showHeader ? (
        <tr className="border-b border-gray-100 bg-[#fcf8f2]">
          <td className="px-5 py-2 font-mono text-[11px] text-gray-500">{group.control.code}</td>
          <td className="px-3 py-2" colSpan={4}>
            <span className="text-xs font-semibold text-gray-800">{group.control.name}</span>
            <span className="ml-2 text-[11px] text-gray-400">{group.subName}</span>
          </td>
          <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-gray-700">{balanceLabel(total, typeCode)}</td>
          <td />
        </tr>
      ) : null}
      {group.rows.map((a) => {
        const b = a.balance ?? { opening: 0, debit: 0, credit: 0, closing: 0, entries: 0 };
        return (
          <tr
            key={a.id}
            onClick={() => onSelect(a)}
            className={cn("group cursor-pointer border-b border-gray-50 transition-colors hover:bg-sky-50/40", !a.is_active && "opacity-55")}
          >
            <td className="px-5 py-3 align-top font-mono text-xs text-gray-400">{a.code}</td>
            <td className="px-3 py-3 align-top">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-gray-900 group-hover:text-sky-700">{a.name}</span>
                {a.is_system ? <Lock className="h-3 w-3 text-gray-300" aria-label="System account" /> : null}
                {!a.is_active ? <span className="rounded bg-gray-100 px-1.5 text-[10px] text-gray-500">Inactive</span> : null}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                {a.link ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-1.5 py-0.5 text-sky-700">
                    <Link2 className="h-3 w-3" />
                    {LINK_LABEL[a.link.kind]}
                  </span>
                ) : null}
                {a.computed ? <span className="rounded-full bg-[#fcf8f2] px-1.5 py-0.5 text-[#8a6520]">Auto from POS</span> : null}
                {a.contact_person && !a.link ? <span>{a.contact_person}</span> : null}
                {a.mobile ? <span>· {a.mobile}</span> : null}
              </div>
            </td>
            <td className="px-3 py-3 text-center align-top">
              {b.entries ? (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-gray-600">{b.entries}</span>
              ) : (
                <span className="text-gray-300">—</span>
              )}
            </td>
            <td className="px-3 py-3 text-right align-top tabular-nums text-gray-700">{moneyOrDash(b.debit)}</td>
            <td className="px-3 py-3 text-right align-top tabular-nums text-emerald-700">{moneyOrDash(b.credit)}</td>
            <td className="px-3 py-3 text-right align-top font-semibold tabular-nums text-gray-900">{balanceLabel(b.closing, a.type_code)}</td>
            <td className="px-2 py-2.5 align-top">
              <RowMenu items={menuFor(a)} />
            </td>
          </tr>
        );
      })}
    </>
  );
}

/* ------------------------------ detail drawer ------------------------------ */

type LedgerPreview = {
  lines: { date: string | null; kind: string; reference: string | null; description: string; debit: number; credit: number; balance: number }[];
};

function AccountDetail({
  account,
  filters,
  canManage,
  onEdit,
  onDelete,
  onLedger,
  onExpense,
}: {
  account: CoaAccount;
  filters: CoaFilters;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onLedger: () => void;
  onExpense: () => void;
}) {
  const [preview, setPreview] = useState<LedgerPreview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    coaApi
      .ledger(account.id, filters)
      .then((res) => alive && setPreview(res))
      .catch(() => alive && setPreview(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [account.id, filters]);

  const b = account.balance ?? { opening: 0, debit: 0, credit: 0, closing: 0, entries: 0 };
  const Icon = TYPE_ICON[account.type_code];
  const canExpense = account.type_code === 5 && !account.computed && account.link?.kind !== "EMPLOYEE" && account.is_active;
  const contact: { icon: ComponentType<{ className?: string }>; label: string; value: string | null }[] = [
    { icon: User, label: "Contact", value: account.contact_person },
    { icon: Phone, label: "Mobile", value: account.mobile },
    { icon: Mail, label: "Email", value: account.email },
    { icon: MapPin, label: "Address", value: account.address },
  ];
  const recent = (preview?.lines ?? []).slice(-8).reverse();

  return (
    <div className="flex min-h-full flex-col">
      <SheetHeader className="space-y-3 border-b border-gray-100 bg-gradient-to-br from-[#fcf8f2] to-white p-5 text-left">
        <div className="flex items-start gap-3 pr-6">
          <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border", TYPE_STYLE[account.type_code].badge)}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <SheetTitle className="break-words text-lg leading-tight">{account.name}</SheetTitle>
            <SheetDescription className="mt-1 text-xs">
              <span className="font-mono">{account.code}</span> · {account.type_name} › {account.sub_type.name} › {account.control.name}
            </SheetDescription>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {account.is_system ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600">
              <Lock className="h-3 w-3" />System account
            </span>
          ) : null}
          {account.link ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700">
              <Link2 className="h-3 w-3" />
              {LINK_LABEL[account.link.kind]}: {account.link.name}
            </span>
          ) : null}
          {!account.is_active ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">Inactive</span> : null}
        </div>
        {account.computed_source ? (
          <p className="rounded-lg bg-[#fcf8f2] px-3 py-2 text-xs text-[#8a6520] ring-1 ring-[#a67c2e]/20">
            Calculated automatically from {account.computed_source}.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="h-8 bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={onLedger}>
            <BookOpenText className="mr-1.5 h-4 w-4" />Full ledger
          </Button>
          {canExpense ? (
            <Button size="sm" variant="outline" className="h-8 bg-white" onClick={onExpense}>
              <Receipt className="mr-1.5 h-4 w-4" />Record expense
            </Button>
          ) : null}
          {canManage ? (
            <Button size="sm" variant="outline" className="h-8 bg-white" onClick={onEdit}>
              <Pencil className="mr-1.5 h-4 w-4" />Edit
            </Button>
          ) : null}
          {canManage && !account.is_system && !account.link ? (
            <Button size="sm" variant="outline" className="h-8 bg-white text-rose-600 hover:text-rose-700" onClick={onDelete}>
              <Trash2 className="mr-1.5 h-4 w-4" />Delete
            </Button>
          ) : null}
        </div>
      </SheetHeader>

      <div className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile label="Opening" value={balanceLabel(b.opening, account.type_code)} />
          <StatTile label="Closing balance" value={balanceLabel(b.closing, account.type_code)} tone="brand" />
          <StatTile label="Debit · period" value={b.debit ? money(b.debit) : "—"} />
          <StatTile label="Credit · period" value={b.credit ? money(b.credit) : "—"} />
        </div>

        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Contact & tax details</h4>
          <div className="divide-y divide-gray-50 rounded-xl border border-gray-100">
            {contact.map((c) => (
              <div key={c.label} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                <c.icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <span className="w-16 shrink-0 text-gray-500">{c.label}</span>
                <span className={cn("min-w-0 break-words", c.value ? "font-medium text-gray-900" : "text-gray-300")}>{c.value || "Not set"}</span>
              </div>
            ))}
            <div className="grid grid-cols-3 divide-x divide-gray-50">
              {[
                ["NIC", account.nic],
                ["NTN", account.ntn],
                ["Opening", account.opening_balance ? `${money(account.opening_balance)} ${account.opening_side === "DEBIT" ? "Dr" : "Cr"}` : null],
              ].map(([label, value]) => (
                <div key={label} className="px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
                  <p className={cn("break-words text-xs", value ? "font-medium text-gray-900" : "text-gray-300")}>{value || "—"}</p>
                </div>
              ))}
            </div>
          </div>
          {account.notes ? <p className="mt-2 rounded-lg bg-amber-50/60 px-3 py-2 text-xs text-gray-700">{account.notes}</p> : null}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Recent postings</h4>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" /> : <span className="text-[11px] text-gray-400">{b.entries} in period</span>}
          </div>
          {recent.length === 0 && !loading ? (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-xs text-gray-400">No postings in this period</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-100">
              {recent.map((line, i) => (
                <div key={i} className="flex items-start gap-3 border-b border-gray-50 px-3 py-2.5 last:border-0">
                  <div className="w-12 shrink-0 text-center">
                    <p className="text-[11px] font-semibold text-gray-700">{line.date ? format(new Date(`${line.date}T00:00:00`), "dd") : "—"}</p>
                    <p className="text-[10px] uppercase text-gray-400">{line.date ? format(new Date(`${line.date}T00:00:00`), "MMM") : ""}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset", KIND_STYLE[line.kind])}>
                      {KIND_LABEL[line.kind] || line.kind}
                    </span>
                    <p className="mt-0.5 break-words text-xs text-gray-700">{line.description}</p>
                  </div>
                  <span className={cn("shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums", line.debit ? "text-gray-900" : "text-emerald-700")}>
                    {line.debit ? `Dr ${moneyOrDash(line.debit)}` : `Cr ${moneyOrDash(line.credit)}`}
                  </span>
                </div>
              ))}
              <button
                type="button"
                onClick={onLedger}
                className="flex w-full items-center justify-center gap-1 bg-gray-50 px-3 py-2.5 text-xs font-medium text-[#8a6520] hover:bg-[#fcf8f2]"
              >
                View full ledger <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
