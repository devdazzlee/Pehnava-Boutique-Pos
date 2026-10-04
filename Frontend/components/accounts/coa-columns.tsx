"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Power,
  Printer,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./coa-dialogs";
import {
  apiError,
  coaApi,
  escapeHtml,
  isDebitNature,
  LINK_LABEL,
  money,
  naturalAmount,
  printDocument,
  TYPE_STYLE,
  type CoaAccount,
  type CoaControl,
  type CoaSubType,
  type CoaTree,
  type CoaType,
} from "./coa-shared";

/* ============================================================
 * Chart of Accounts — four linked columns, the way accountants
 * already know it: Type → Sub type → Control → Account.
 * Pick in one column and the next fills in; add / edit happens
 * in the panel underneath without losing your place.
 * ============================================================ */

type Level = 0 | 1 | 2 | 3;
type Form =
  | { mode: "add"; level: 1 | 2 | 3 }
  | { mode: "edit"; level: 1 | 2 | 3 }
  | null;

const LEVEL_NAME = ["Type", "Group (sub type)", "Head (control account)", "Account"] as const;
const SHORT = ["type", "group", "head", "account"] as const;

const amt = (v: number) => {
  const a = Math.abs(v);
  if (a < 0.5) return "—";
  return `${v < 0 ? "−" : ""}${Math.round(a).toLocaleString("en-PK")}`;
};

export function CoaColumns({
  tree,
  reload,
  canManage,
  onOpenLedger,
  createRequest,
}: {
  tree: CoaTree;
  reload: () => void;
  canManage: boolean;
  onOpenLedger: (accountId: string) => void;
  createRequest?: { kind: "sub" | "control" | "account"; n: number } | null;
}) {
  const { toast } = useToast();
  const [showInactive, setShowInactive] = useState(false);
  const [typeCode, setTypeCode] = useState<number>(1);
  const [subId, setSubId] = useState<string | null>(null);
  const [controlId, setControlId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [focus, setFocus] = useState<Level>(0);
  const [form, setForm] = useState<Form>(null);
  const [accountQuery, setAccountQuery] = useState("");
  const [global, setGlobal] = useState("");
  const [globalOpen, setGlobalOpen] = useState(false);
  const [mobileLevel, setMobileLevel] = useState<Level>(0);
  const [deleting, setDeleting] = useState<{ level: 1 | 2 | 3; id: string; label: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const active = <T extends { is_active: boolean }>(rows: T[]) => (showInactive ? rows : rows.filter((r) => r.is_active));

  const type: CoaType | undefined = tree.types.find((t) => t.code === typeCode);
  const subs = useMemo(() => active(type?.subTypes ?? []), [type, showInactive]); // eslint-disable-line react-hooks/exhaustive-deps
  const sub: CoaSubType | undefined = subs.find((s) => s.id === subId);
  const controls = useMemo(() => active(sub?.controls ?? []), [sub, showInactive]); // eslint-disable-line react-hooks/exhaustive-deps
  const control: CoaControl | undefined = controls.find((c) => c.id === controlId);
  const allAccounts = useMemo(() => active(control?.accounts ?? []), [control, showInactive]); // eslint-disable-line react-hooks/exhaustive-deps
  const accounts = useMemo(() => {
    const q = accountQuery.trim().toLowerCase();
    if (!q) return allAccounts;
    return allAccounts.filter((a) => `${a.code} ${a.name} ${a.contact_person ?? ""} ${a.mobile ?? ""}`.toLowerCase().includes(q));
  }, [allAccounts, accountQuery]);
  const account: CoaAccount | undefined = allAccounts.find((a) => a.id === accountId);

  // Keep a sensible selection as data / filters change: first child is picked, like the desktop app.
  useEffect(() => {
    if (!subs.find((s) => s.id === subId)) setSubId(subs[0]?.id ?? null);
  }, [subs, subId]);
  useEffect(() => {
    if (!controls.find((c) => c.id === controlId)) setControlId(controls[0]?.id ?? null);
  }, [controls, controlId]);
  useEffect(() => {
    if (accountId && !allAccounts.find((a) => a.id === accountId)) setAccountId(null);
  }, [allAccounts, accountId]);
  useEffect(() => setAccountQuery(""), [controlId]);

  // "New …" from the page header.
  useEffect(() => {
    if (!createRequest || !canManage) return;
    const level = createRequest.kind === "sub" ? 1 : createRequest.kind === "control" ? 2 : 3;
    startAdd(level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRequest?.n]);

  const pickType = (code: number) => {
    setTypeCode(code);
    setSubId(null);
    setControlId(null);
    setAccountId(null);
    setFocus(0);
    setForm(null);
    setMobileLevel(1);
  };
  const pickSub = (id: string) => {
    setSubId(id);
    setControlId(null);
    setAccountId(null);
    setFocus(1);
    setForm(null);
    setMobileLevel(2);
  };
  const pickControl = (id: string) => {
    setControlId(id);
    setAccountId(null);
    setFocus(2);
    setForm(null);
    setMobileLevel(3);
  };
  const pickAccount = (id: string) => {
    setAccountId(id);
    setFocus(3);
    setForm(null);
  };

  const startAdd = (level: 1 | 2 | 3) => {
    if (level >= 2 && !sub) return toast({ title: "Pick a sub type first" });
    if (level === 3 && !control) return toast({ title: "Pick a control account first" });
    setForm({ mode: "add", level });
    setFocus(level);
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  };
  const startEdit = (level: 1 | 2 | 3) => {
    setForm({ mode: "edit", level });
    setFocus(level);
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  };

  /* ---------- global search ---------- */
  const flat = useMemo(
    () =>
      tree.types.flatMap((t) =>
        t.subTypes.flatMap((s) => [
          ...s.controls.flatMap((c) => [
            { level: 2 as const, code: c.code, name: c.name, path: `${t.name} › ${s.name}`, t: t.code, s: s.id, c: c.id, a: null as string | null, active: c.is_active },
            ...c.accounts.map((a) => ({ level: 3 as const, code: a.code, name: a.name, path: `${t.name} › ${s.name} › ${c.name}`, t: t.code, s: s.id, c: c.id, a: a.id, active: a.is_active, extra: `${a.contact_person ?? ""} ${a.mobile ?? ""}` })),
          ]),
          { level: 1 as const, code: s.code, name: s.name, path: t.name, t: t.code, s: s.id, c: null as string | null, a: null as string | null, active: s.is_active },
        ]),
      ),
    [tree],
  );
  const hits = useMemo(() => {
    const q = global.trim().toLowerCase();
    if (!q) return [];
    return flat
      .filter((x) => (showInactive || x.active) && `${x.code} ${x.name} ${"extra" in x ? x.extra : ""}`.toLowerCase().includes(q))
      .sort((a, b) => (a.code.startsWith(q) ? -1 : 0) - (b.code.startsWith(q) ? -1 : 0) || b.level - a.level)
      .slice(0, 12);
  }, [flat, global, showInactive]);
  const jump = (h: (typeof flat)[number]) => {
    setTypeCode(h.t);
    setSubId(h.s);
    setControlId(h.c);
    setAccountId(h.a);
    setFocus(h.a ? 3 : h.c ? 2 : 1);
    setMobileLevel(h.a ? 3 : h.c ? 3 : 2);
    setForm(null);
    setGlobal("");
    setGlobalOpen(false);
  };

  /* ---------- keyboard ---------- */
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
    const lists: { ids: (string | number)[]; current: string | number | null; pick: (v: never) => void }[] = [
      { ids: tree.types.map((t) => t.code), current: typeCode, pick: pickType as (v: never) => void },
      { ids: subs.map((s) => s.id), current: subId, pick: pickSub as (v: never) => void },
      { ids: controls.map((c) => c.id), current: controlId, pick: pickControl as (v: never) => void },
      { ids: accounts.map((a) => a.id), current: accountId, pick: pickAccount as (v: never) => void },
    ];
    const col = lists[focus];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const i = col.ids.indexOf(col.current as never);
      const next = col.ids[Math.max(0, Math.min(col.ids.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
      if (next !== undefined) {
        col.pick(next as never);
        setFocus(focus);
      }
    } else if (e.key === "ArrowRight" && focus < 3) {
      e.preventDefault();
      const nextCol = lists[focus + 1];
      if (nextCol.ids.length) {
        if (focus + 1 === 3 && !accountId) pickAccount(String(nextCol.ids[0]));
        setFocus((focus + 1) as Level);
      }
    } else if (e.key === "ArrowLeft" && focus > 0) {
      e.preventDefault();
      setFocus((focus - 1) as Level);
    } else if (e.key === "Enter" && canManage && focus > 0) {
      e.preventDefault();
      startEdit(focus as 1 | 2 | 3);
    }
  };

  /* ---------- print ---------- */
  const print = () => {
    const rows = tree.types
      .flatMap((t) => [
        `<tr style="background:#f3ead9"><td><b>${t.code}</b></td><td colspan="2"><b>${escapeHtml(t.name)}</b></td></tr>`,
        ...t.subTypes
          .filter((s) => showInactive || s.is_active)
          .flatMap((s) => [
            `<tr><td style="padding-left:16px"><b>${s.code}</b></td><td colspan="2"><b>${escapeHtml(s.name)}</b></td></tr>`,
            ...s.controls
              .filter((c) => showInactive || c.is_active)
              .flatMap((c) => [
                `<tr><td style="padding-left:32px">${c.code}</td><td colspan="2"><i>${escapeHtml(c.name)}</i></td></tr>`,
                ...c.accounts
                  .filter((a) => showInactive || a.is_active)
                  .map((a) => `<tr><td style="padding-left:48px">${a.code}</td><td>${escapeHtml(a.name)}</td><td class="r">${money(naturalAmount(a.balance?.closing ?? 0, t.code))}</td></tr>`),
              ]),
          ]),
      ])
      .join("");
    printDocument("Chart of Accounts", `${tree.summary.accountCount} accounts`, `<table><thead><tr><th>Code</th><th>Account</th><th class="r">Balance</th></tr></thead><tbody>${rows}</tbody></table>`);
  };

  /* ---------- delete / toggle ---------- */
  const toggleActive = async (level: 1 | 2 | 3) => {
    try {
      if (level === 1 && sub) await coaApi.updateSubType(sub.id, { is_active: !sub.is_active });
      if (level === 2 && control) await coaApi.updateControl(control.id, { is_active: !control.is_active });
      if (level === 3 && account) await coaApi.updateAccount(account.id, { is_active: !account.is_active });
      toast({ title: "Updated" });
      reload();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not update", description: apiError(e) });
    }
  };

  const path = [type?.name, sub ? `${sub.code} ${sub.name}` : null, control ? `${control.code} ${control.name}` : null, account ? `${account.code} ${account.name}` : null].filter(Boolean) as string[];

  return (
    <div className="space-y-3" onKeyDown={onKey}>
      {/* toolbar */}
      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 lg:flex-row lg:items-center">
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
          {path.map((p, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-300" />}
              <button
                type="button"
                onClick={() => {
                  setFocus(i as Level);
                  setMobileLevel(Math.min(3, i + 1) as Level);
                  if (i < 3) setAccountId(null);
                  setForm(null);
                }}
                className={cn("rounded px-1.5 py-0.5 hover:bg-gray-100", i === path.length - 1 ? "font-semibold text-[#2a2012]" : "text-gray-500")}
              >
                {p}
              </button>
            </span>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={global}
              onChange={(e) => {
                setGlobal(e.target.value);
                setGlobalOpen(true);
              }}
              onFocus={() => setGlobalOpen(true)}
              onBlur={() => setTimeout(() => setGlobalOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && hits[0]) jump(hits[0]);
                if (e.key === "Escape") setGlobal("");
              }}
              placeholder="Find any account by name or code…"
              className="h-9 pl-9 pr-8"
            />
            {global && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setGlobal("")}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {globalOpen && global.trim() && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                {hits.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-gray-500">No account matches “{global}”.</p>
                ) : (
                  hits.map((h, i) => (
                    <button key={`${h.level}-${h.code}-${i}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => jump(h)} className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-[#fcf8f2]">
                      <span className="mt-0.5 shrink-0 rounded bg-gray-100 px-1.5 font-mono text-[11px] text-gray-700">{h.code}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">{h.name}</span>
                        <span className="block truncate text-[11px] text-gray-500">
                          {SHORT[h.level]} · {h.path}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <Button size="sm" variant="outline" className="h-9" onClick={() => setShowInactive((v) => !v)} title={showInactive ? "Hide inactive" : "Show inactive"}>
            {showInactive ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
            {showInactive ? "Hide inactive" : "Show inactive"}
          </Button>
          <Button size="sm" variant="outline" className="h-9" onClick={print}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {/* columns */}
      <div className="grid gap-3 lg:grid-cols-[minmax(170px,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)]">
        <Column
          index={0}
          title={LEVEL_NAME[0]}
          count={tree.types.length}
          focused={focus === 0}
          mobileHidden={mobileLevel !== 0}
          onFocus={() => setFocus(0)}
        >
          {tree.types.map((t) => (
            <Row
              key={t.code}
              code={String(t.code)}
              name={t.name}
              amount={naturalAmount(t.totals.closing, t.code)}
              selected={t.code === typeCode}
              focused={focus === 0}
              dot={TYPE_STYLE[t.code]?.dot}
              hint={`${t.subTypes.length} sub types`}
              onClick={() => pickType(t.code)}
            />
          ))}
        </Column>

        <Column
          index={1}
          title={LEVEL_NAME[1]}
          subtitle={type?.name}
          count={subs.length}
          focused={focus === 1}
          mobileHidden={mobileLevel !== 1}
          onBack={() => setMobileLevel(0)}
          onFocus={() => setFocus(1)}
          onAdd={canManage ? () => startAdd(1) : undefined}
        >
          {subs.length === 0 ? (
            <ColumnEmpty text="No sub types yet." action={canManage ? () => startAdd(1) : undefined} />
          ) : (
            subs.map((s) => (
              <Row
                key={s.id}
                code={s.code}
                name={s.name}
                amount={naturalAmount(s.totals.closing, typeCode)}
                selected={s.id === subId}
                focused={focus === 1}
                inactive={!s.is_active}
                system={s.is_system}
                hint={`${s.controls.length} controls`}
                onClick={() => pickSub(s.id)}
              />
            ))
          )}
        </Column>

        <Column
          index={2}
          title={LEVEL_NAME[2]}
          subtitle={sub?.name}
          count={controls.length}
          focused={focus === 2}
          mobileHidden={mobileLevel !== 2}
          onBack={() => setMobileLevel(1)}
          onFocus={() => setFocus(2)}
          onAdd={canManage && sub ? () => startAdd(2) : undefined}
        >
          {!sub ? (
            <ColumnEmpty text="Pick a sub type." />
          ) : controls.length === 0 ? (
            <ColumnEmpty text="No control accounts yet." action={canManage ? () => startAdd(2) : undefined} />
          ) : (
            controls.map((c) => (
              <Row
                key={c.id}
                code={c.code}
                name={c.name}
                amount={naturalAmount(c.totals.closing, typeCode)}
                selected={c.id === controlId}
                focused={focus === 2}
                inactive={!c.is_active}
                system={c.is_system}
                hint={`${c.accounts.length} accounts`}
                onClick={() => pickControl(c.id)}
              />
            ))
          )}
        </Column>

        <Column
          index={3}
          title={LEVEL_NAME[3]}
          subtitle={control?.name}
          count={allAccounts.length}
          focused={focus === 3}
          mobileHidden={mobileLevel !== 3}
          onBack={() => setMobileLevel(2)}
          onFocus={() => setFocus(3)}
          onAdd={canManage && control ? () => startAdd(3) : undefined}
          search={
            allAccounts.length > 6 ? (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <Input value={accountQuery} onChange={(e) => setAccountQuery(e.target.value)} placeholder={`Search ${allAccounts.length} accounts…`} className="h-8 pl-8 text-xs" />
              </div>
            ) : null
          }
        >
          {!control ? (
            <ColumnEmpty text="Pick a control account." />
          ) : accounts.length === 0 ? (
            <ColumnEmpty text={accountQuery ? "No account matches." : "No accounts yet."} action={canManage && !accountQuery ? () => startAdd(3) : undefined} />
          ) : (
            accounts.map((a) => (
              <Row
                key={a.id}
                code={a.code}
                name={a.name}
                amount={naturalAmount(a.balance?.closing ?? 0, typeCode)}
                selected={a.id === accountId}
                focused={focus === 3}
                inactive={!a.is_active}
                system={a.is_system || a.computed}
                linked={a.link ? LINK_LABEL[a.link.kind] ?? a.link.kind : null}
                hint={a.contact_person || a.mobile || undefined}
                onClick={() => pickAccount(a.id)}
                onDoubleClick={() => onOpenLedger(a.id)}
              />
            ))
          )}
        </Column>
      </div>

      {/* panel */}
      <div ref={panelRef}>
        {form ? (
          <EditorPanel
            key={`${form.mode}-${form.level}-${form.mode === "edit" ? (form.level === 1 ? subId : form.level === 2 ? controlId : accountId) : "new"}`}
            form={form}
            type={type!}
            sub={sub}
            control={control}
            account={account}
            onCancel={() => setForm(null)}
            onSaved={(level, id, keepOpen) => {
              reload();
              if (keepOpen) return;
              setForm(null);
              if (level === 1) {
                setSubId(id);
                setFocus(1);
              } else if (level === 2) {
                setControlId(id);
                setFocus(2);
              } else {
                setAccountId(id);
                setFocus(3);
              }
            }}
          />
        ) : (
          <DetailPanel
            focus={focus}
            type={type}
            sub={sub}
            control={control}
            account={account}
            canManage={canManage}
            onAdd={startAdd}
            onEdit={startEdit}
            onToggle={toggleActive}
            onLedger={onOpenLedger}
            onDelete={(level) => {
              const target = level === 1 ? sub : level === 2 ? control : account;
              if (target) setDeleting({ level, id: target.id, label: `${target.code} · ${target.name}` });
            }}
          />
        )}
      </div>

      <p className="hidden text-[11px] text-gray-400 lg:block">Tip: use ↑ ↓ to move, ← → to change column, Enter to edit. Double-click an account to open its ledger.</p>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deleting ? SHORT[deleting.level] : ""}?`}
        description={
          <span>
            <b>{deleting?.label}</b> will be removed. Only items with no accounts or transactions under them can be deleted — otherwise deactivate it.
          </span>
        }
        onConfirm={async () => {
          if (!deleting) return;
          try {
            if (deleting.level === 1) await coaApi.deleteSubType(deleting.id);
            if (deleting.level === 2) await coaApi.deleteControl(deleting.id);
            if (deleting.level === 3) await coaApi.deleteAccount(deleting.id);
            toast({ title: "Deleted", description: deleting.label });
            setDeleting(null);
            reload();
          } catch (e) {
            toast({ variant: "destructive", title: "Could not delete", description: apiError(e) });
          }
        }}
      />
    </div>
  );
}

/* ====================================================================== */

function Column({
  index,
  title,
  subtitle,
  count,
  focused,
  mobileHidden,
  onBack,
  onFocus,
  onAdd,
  search,
  children,
}: {
  index: number;
  title: string;
  subtitle?: string;
  count: number;
  focused: boolean;
  mobileHidden: boolean;
  onBack?: () => void;
  onFocus: () => void;
  onAdd?: () => void;
  search?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      tabIndex={0}
      onFocus={onFocus}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white outline-none transition-shadow",
        focused ? "border-[#a67c2e]/60 shadow-[0_0_0_3px_rgba(166,124,46,0.12)]" : "border-gray-200",
        mobileHidden && "hidden lg:flex",
      )}
    >
      <header className="flex items-center gap-2 border-b border-gray-100 bg-[#fcf8f2] px-3 py-2.5">
        {onBack && (
          <button type="button" onClick={onBack} className="rounded p-0.5 text-gray-500 hover:bg-white lg:hidden" aria-label="Back">
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2a2012] text-[10px] font-bold text-[#e6c98f]">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold uppercase tracking-wide text-[#2a2012]">{title}</div>
          {subtitle && <div className="truncate text-[11px] text-gray-500">in {subtitle}</div>}
        </div>
        <span className="rounded-full bg-white px-1.5 text-[11px] tabular-nums text-gray-500 ring-1 ring-gray-200">{count}</span>
        {onAdd && (
          <button type="button" onClick={onAdd} className="flex h-6 items-center gap-0.5 rounded-md bg-[#2a2012] px-1.5 text-[11px] font-medium text-white hover:bg-[#3b2e1a]" title={`Add ${title.toLowerCase()}`}>
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        )}
      </header>
      {search && <div className="border-b border-gray-100 p-2">{search}</div>}
      <div data-col-body className="relative max-h-[360px] min-h-[220px] flex-1 overflow-y-auto p-1.5 lg:h-[360px]">{children}</div>
    </section>
  );
}

function Row({
  code,
  name,
  amount,
  selected,
  focused,
  inactive,
  system,
  linked,
  dot,
  hint,
  onClick,
  onDoubleClick,
}: {
  code: string;
  name: string;
  amount: number;
  selected: boolean;
  focused: boolean;
  inactive?: boolean;
  system?: boolean;
  linked?: string | null;
  dot?: string;
  hint?: string;
  onClick: () => void;
  onDoubleClick?: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    const box = el?.closest("[data-col-body]") as HTMLElement | null;
    if (!selected || !el || !box) return;
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop - 6;
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight + 6;
  }, [selected]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors",
        selected ? (focused ? "bg-[#2a2012] text-white" : "bg-[#efe4cf] text-[#2a2012]") : "hover:bg-gray-50",
        inactive && !selected && "opacity-50",
      )}
    >
      {dot && <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />}
      <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px]", selected && focused ? "bg-white/15 text-[#e6c98f]" : "bg-gray-100 text-gray-600")}>{code}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate text-sm font-medium" title={name}>
            {name}
          </span>
          {system && <Lock className={cn("h-3 w-3 shrink-0", selected && focused ? "text-white/60" : "text-gray-300")} aria-label="System" />}
          {linked && <Link2 className={cn("h-3 w-3 shrink-0", selected && focused ? "text-white/60" : "text-sky-400")} aria-label={linked} />}
        </span>
        {hint && <span className={cn("block truncate text-[11px]", selected && focused ? "text-white/60" : "text-gray-400")}>{hint}</span>}
      </span>
      <span className={cn("shrink-0 text-right text-xs tabular-nums", selected && focused ? "text-white/80" : amount < 0 ? "text-rose-600" : "text-gray-500")}>{amt(amount)}</span>
    </button>
  );
}

function ColumnEmpty({ text, action }: { text: string; action?: () => void }) {
  return (
    <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 px-4 text-center text-xs text-gray-400">
      {text}
      {action && (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={action}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add one
        </Button>
      )}
    </div>
  );
}

/* ====================================================================== */

function DetailPanel({
  focus,
  type,
  sub,
  control,
  account,
  canManage,
  onAdd,
  onEdit,
  onToggle,
  onLedger,
  onDelete,
}: {
  focus: Level;
  type?: CoaType;
  sub?: CoaSubType;
  control?: CoaControl;
  account?: CoaAccount;
  canManage: boolean;
  onAdd: (l: 1 | 2 | 3) => void;
  onEdit: (l: 1 | 2 | 3) => void;
  onToggle: (l: 1 | 2 | 3) => void;
  onLedger: (id: string) => void;
  onDelete: (l: 1 | 2 | 3) => void;
}) {
  if (!type) return null;
  const tc = type.code;
  const level: Level = focus === 3 && account ? 3 : focus >= 2 && control ? 2 : focus >= 1 && sub ? 1 : 0;
  const item = level === 3 ? account : level === 2 ? control : level === 1 ? sub : null;
  const totals = level === 3 ? account?.balance : level === 2 ? control?.totals : level === 1 ? sub?.totals : type.totals;
  const closing = naturalAmount(totals?.closing ?? 0, tc);
  const debitNature = isDebitNature(tc);
  const locked = level === 3 ? !!(account?.is_system || account?.computed) : level === 2 ? !!control?.is_system : level === 1 ? !!sub?.is_system : true;
  const childLevel = (level + 1) as 1 | 2 | 3;
  const childName = level < 3 ? SHORT[childLevel] : null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#a67c2e]">{LEVEL_NAME[level]}</div>
          <h3 className="mt-0.5 flex flex-wrap items-center gap-2 text-lg font-semibold text-gray-900">
            <span className="rounded-md bg-[#2a2012] px-2 py-0.5 font-mono text-sm text-[#e6c98f]">{level === 0 ? type.code : item?.code}</span>
            {level === 0 ? type.name : item?.name}
            {item && !item.is_active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">Inactive</span>}
            {locked && level > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                <Lock className="h-3 w-3" />
                {level === 3 && account?.computed ? "Calculated automatically" : "System"}
              </span>
            )}
          </h3>
          {level === 3 && account?.link && (
            <p className="mt-1 flex items-center gap-1 text-xs text-sky-700">
              <Link2 className="h-3.5 w-3.5" />
              Linked to {LINK_LABEL[account.link.kind] ?? account.link.kind}: {account.link.name}
            </p>
          )}
          {level === 3 && account?.computed && account.computed_source && <p className="mt-1 text-xs text-gray-500">Balance comes from {account.computed_source}.</p>}

          {level === 3 && account && (account.contact_person || account.mobile || account.address || account.nic || account.ntn || account.email || account.notes) && (
            <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {account.contact_person && <Info label="Contact person">{account.contact_person}</Info>}
              {account.mobile && <Info label="Mobile">{account.mobile}</Info>}
              {account.email && <Info label="Email">{account.email}</Info>}
              {account.address && <Info label="Address">{account.address}</Info>}
              {account.nic && <Info label="CNIC">{account.nic}</Info>}
              {account.ntn && <Info label="NTN">{account.ntn}</Info>}
              {account.notes && <Info label="Notes">{account.notes}</Info>}
            </dl>
          )}
          {level < 3 && (item as CoaSubType | CoaControl | null)?.description && <p className="mt-2 text-sm text-gray-600">{(item as CoaSubType | CoaControl).description}</p>}
          {level === 0 && <p className="mt-2 text-sm text-gray-500">Main account types are fixed. Pick a sub type to see its control accounts.</p>}
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[460px]">
          <Fig label="Opening" value={money(naturalAmount(totals?.opening ?? 0, tc))} />
          <Fig label="Debit" value={money(totals?.debit ?? 0)} />
          <Fig label="Credit" value={money(totals?.credit ?? 0)} />
          <Fig label={`Balance (${debitNature ? "Dr" : "Cr"})`} value={money(closing)} dark />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 bg-gray-50/60 px-4 py-3">
        {level === 3 && account && (
          <Button size="sm" onClick={() => onLedger(account.id)} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            <BookOpenText className="mr-1.5 h-4 w-4" />
            Open ledger
          </Button>
        )}
        {canManage && childName && (level > 0 || childLevel === 1) && (
          <Button size="sm" variant={level === 3 ? "outline" : "default"} onClick={() => onAdd(childLevel)} className={level < 3 ? "bg-[#2a2012] hover:bg-[#3b2e1a]" : ""}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add {childName} {level > 0 ? `under ${item?.code}` : `in ${type.name}`}
          </Button>
        )}
        {canManage && level > 0 && (
          <>
            <Button size="sm" variant="outline" onClick={() => onEdit(level as 1 | 2 | 3)} disabled={level === 3 && !!account?.computed}>
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
            {!locked && (
              <Button size="sm" variant="outline" onClick={() => onToggle(level as 1 | 2 | 3)}>
                <Power className="mr-1.5 h-4 w-4" />
                {item?.is_active ? "Deactivate" : "Activate"}
              </Button>
            )}
            {!locked && !(level === 3 && account?.link) && (
              <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => onDelete(level as 1 | 2 | 3)}>
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete
              </Button>
            )}
          </>
        )}
        {level === 3 && account?.link && <span className="text-[11px] text-gray-500">Linked accounts are managed from their {LINK_LABEL[account.link.kind]?.toLowerCase() ?? "record"} screen.</span>}
      </div>
    </section>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0 text-gray-900">{children}</dd>
    </div>
  );
}

function Fig({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", dark ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-gray-200 bg-white")}>
      <div className={cn("text-[11px]", dark ? "text-stone-300" : "text-gray-500")}>{label}</div>
      <div className="truncate text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/* ====================================================================== */

function EditorPanel({
  form,
  type,
  sub,
  control,
  account,
  onCancel,
  onSaved,
}: {
  form: NonNullable<Form>;
  type: CoaType;
  sub?: CoaSubType;
  control?: CoaControl;
  account?: CoaAccount;
  onCancel: () => void;
  onSaved: (level: 1 | 2 | 3, id: string, keepOpen?: boolean) => void;
}) {
  const { toast } = useToast();
  const { mode, level } = form;
  const editing = mode === "edit" ? (level === 1 ? sub : level === 2 ? control : account) : undefined;
  const isPL = type.code === 4 || type.code === 5;
  const [code, setCode] = useState(editing?.code ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState((level < 3 ? (editing as CoaSubType | CoaControl | undefined)?.description : "") ?? "");
  const acc = level === 3 ? (editing as CoaAccount | undefined) : undefined;
  const [f, setF] = useState({
    contact_person: acc?.contact_person ?? "",
    mobile: acc?.mobile ?? "",
    address: acc?.address ?? "",
    nic: acc?.nic ?? "",
    ntn: acc?.ntn ?? "",
    email: acc?.email ?? "",
    notes: acc?.notes ?? "",
    opening_balance: acc?.opening_balance ? String(acc.opening_balance) : "",
    opening_side: (acc?.opening_side ?? (isDebitNature(type.code) ? "DEBIT" : "CREDIT")) as "DEBIT" | "CREDIT",
    is_active: acc?.is_active ?? true,
  });
  const [more, setMore] = useState(!!(acc && (acc.address || acc.nic || acc.ntn || acc.email || acc.notes)));
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    if (mode !== "add") return;
    const params = level === 1 ? { typeCode: type.code } : level === 2 ? { subTypeId: sub?.id } : { controlId: control?.id };
    coaApi
      .nextCode(params)
      .then((r: { subType?: string; control?: string; account?: string }) => setCode((level === 1 ? r.subType : level === 2 ? r.control : r.account) || ""))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parent = level === 1 ? `${type.code} ${type.name}` : level === 2 ? `${sub?.code} ${sub?.name}` : `${control?.code} ${control?.name}`;
  const linked = !!acc?.link;

  const save = async (addAnother = false) => {
    if (!name.trim()) return toast({ variant: "destructive", title: "Enter a name" });
    setSaving(true);
    try {
      let id = editing?.id ?? "";
      if (level === 1) {
        if (editing) await coaApi.updateSubType(editing.id, { name: name.trim(), description: description || null });
        else id = (await coaApi.createSubType({ type_code: type.code, code: code || undefined, name: name.trim(), description: description || null })).id;
      } else if (level === 2) {
        if (editing) await coaApi.updateControl(editing.id, { name: name.trim(), description: description || null });
        else id = (await coaApi.createControl({ sub_type_id: sub!.id, code: code || undefined, name: name.trim(), description: description || null })).id;
      } else {
        const body = {
          name: name.trim(),
          contact_person: f.contact_person || null,
          mobile: f.mobile || null,
          address: f.address || null,
          nic: f.nic || null,
          ntn: f.ntn || null,
          email: f.email || null,
          notes: f.notes || null,
          opening_balance: isPL ? 0 : Number(f.opening_balance) || 0,
          opening_side: f.opening_side,
          is_active: f.is_active,
        };
        if (editing) await coaApi.updateAccount(editing.id, body);
        else id = (await coaApi.createAccount({ ...body, control_id: control!.id, code: code || undefined })).id;
      }
      toast({ title: editing ? "Saved" : "Added", description: `${code} · ${name.trim()}` });
      if (addAnother && !editing) {
        setName("");
        setF((x) => ({ ...x, contact_person: "", mobile: "", address: "", nic: "", ntn: "", email: "", notes: "", opening_balance: "" }));
        const params = level === 1 ? { typeCode: type.code } : level === 2 ? { subTypeId: sub?.id } : { controlId: control?.id };
        coaApi
          .nextCode(params)
          .then((r: { subType?: string; control?: string; account?: string }) => setCode((level === 1 ? r.subType : level === 2 ? r.control : r.account) || ""))
          .catch(() => undefined);
        nameRef.current?.focus();
        onSaved(level, id, true);
        return;
      }
      onSaved(level, id);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save", description: apiError(e) });
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <section className="rounded-xl border-2 border-[#a67c2e]/50 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-gray-100 bg-[#fcf8f2] px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#a67c2e]">{mode === "add" ? `Add ${SHORT[level]}` : `Edit ${SHORT[level]}`}</div>
          <div className="text-sm text-gray-700">
            Under <b className="text-gray-900">{parent}</b>
          </div>
        </div>
        <button type="button" onClick={onCancel} className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-700" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </header>

      <form
        className="space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-700">Code</span>
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} disabled={mode === "edit"} className="font-mono" placeholder="auto" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-700">{level === 3 ? "Account name" : "Name"} *</span>
            <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} disabled={linked} placeholder={level === 3 ? "e.g. Bilal Salary, Meezan Bank, Electricity" : level === 2 ? "e.g. Payroll Expense" : "e.g. Indirect Expenses"} />
          </label>
        </div>

        {level < 3 ? (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-700">Description (optional)</span>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-700">Contact person</span>
                <Input value={f.contact_person} onChange={set("contact_person")} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-700">Mobile</span>
                <Input value={f.mobile} onChange={set("mobile")} placeholder="03xx xxxxxxx" />
              </label>
            </div>
            {!isPL && (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-700">Opening balance (Rs)</span>
                  <Input type="number" min={0} value={f.opening_balance} onChange={set("opening_balance")} placeholder="0" />
                </label>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-gray-700">Side</span>
                  <div className="flex h-9 rounded-lg border border-gray-200 p-0.5 text-xs">
                    {(["DEBIT", "CREDIT"] as const).map((s) => (
                      <button key={s} type="button" onClick={() => setF((x) => ({ ...x, opening_side: s }))} className={cn("rounded-md px-3 font-medium", f.opening_side === s ? "bg-[#2a2012] text-white" : "text-gray-600")}>
                        {s === "DEBIT" ? "Debit (Dr)" : "Credit (Cr)"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <button type="button" onClick={() => setMore((v) => !v)} className="text-xs font-medium text-[#a67c2e]">
              {more ? "− Fewer details" : "+ Address, CNIC, NTN, email, notes"}
            </button>
            {more && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-xs font-medium text-gray-700">Address</span>
                  <Input value={f.address} onChange={set("address")} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-700">CNIC</span>
                  <Input value={f.nic} onChange={set("nic")} placeholder="xxxxx-xxxxxxx-x" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-700">NTN</span>
                  <Input value={f.ntn} onChange={set("ntn")} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-700">Email</span>
                  <Input value={f.email} onChange={set("email")} type="email" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-700">Notes</span>
                  <Textarea value={f.notes} onChange={set("notes")} rows={1} />
                </label>
              </div>
            )}
            {mode === "edit" && (
              <label className="flex w-fit items-center gap-2 text-sm">
                <Switch checked={f.is_active} onCheckedChange={(v) => setF((x) => ({ ...x, is_active: v }))} />
                Active
              </label>
            )}
          </>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <Button type="submit" disabled={saving} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "add" ? "Save" : "Save changes"}
          </Button>
          {mode === "add" && (
            <Button type="button" variant="outline" disabled={saving} onClick={() => save(true)}>
              Save & add another
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <span className="ml-auto hidden text-[11px] text-gray-400 sm:inline">Enter to save · Esc to cancel</span>
        </div>
      </form>
    </section>
  );
}
