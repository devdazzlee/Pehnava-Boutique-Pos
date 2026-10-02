"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import apiClient from "@/lib/apiClient";

export type ExpenseAccountOption = {
  id: string;
  code: string;
  name: string;
  expense_category_id: string | null;
  employee_id: string | null;
  control: { id: string; code: string; name: string };
};

let cache: ExpenseAccountOption[] | null = null;
let inflight: Promise<ExpenseAccountOption[]> | null = null;

export function loadExpenseAccounts(force = false): Promise<ExpenseAccountOption[]> {
  if (cache && !force) return Promise.resolve(cache);
  if (!inflight || force) {
    inflight = apiClient
      .get("/chart-of-accounts/expense-accounts")
      .then((res) => {
        cache = res.data.data as ExpenseAccountOption[];
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useExpenseAccounts(open = true) {
  const [accounts, setAccounts] = useState<ExpenseAccountOption[]>(cache || []);
  const [loading, setLoading] = useState(!cache);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(!cache);
    loadExpenseAccounts(true)
      .then((rows) => alive && setAccounts(rows))
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open]);
  return { accounts, loading };
}

/**
 * Chart of Accounts expense head picker, grouped by control account
 * (Utility Expenses, Office Expenses, Payroll, ...).
 */
export function ExpenseAccountSelect({
  value,
  onChange,
  accounts,
  loading,
  triggerClassName,
  hidePayroll = true,
}: {
  value: string;
  onChange: (accountId: string) => void;
  accounts: ExpenseAccountOption[];
  loading?: boolean;
  triggerClassName?: string;
  /** Salary accounts are posted from the Salaries module; hide them by default. */
  hidePayroll?: boolean;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: ExpenseAccountOption[] }>();
    for (const account of accounts) {
      if (hidePayroll && account.employee_id) continue;
      const key = account.control.id;
      const group = map.get(key) || { label: `${account.control.code} · ${account.control.name}`, items: [] };
      group.items.push(account);
      map.set(key, group);
    }
    return [...map.values()];
  }, [accounts, hidePayroll]);

  return (
    <Select value={value || "auto"} onValueChange={(v) => onChange(v === "auto" ? "" : v)}>
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={loading ? "Loading accounts…" : "Select expense account"} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value="auto">Auto (from category / Miscellaneous)</SelectItem>
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">{group.label}</SelectLabel>
            {group.items.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                <span className="font-mono text-xs text-muted-foreground">{account.code}</span> {account.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
