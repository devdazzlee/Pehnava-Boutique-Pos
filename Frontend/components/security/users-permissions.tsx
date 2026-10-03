"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { KeyRound, Loader2, Lock, MoreHorizontal, Pencil, Power, RotateCcw, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { loadPermissions } from "@/lib/permissions";
import { Bone, Chips, EmptyState, FilterBar, Panel, SearchBox } from "@/components/accounts/coa-ui";

type RoleInfo = { role: string; label: string; description: string };
type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  branch: { id: string; name: string; code: string } | null;
  employee: { id: string; name: string } | null;
};
type Matrix = {
  permissions: { key: string; label: string; group: string; description: string }[];
  roles: RoleInfo[];
  grants: { role: string; locked: boolean; allowed: Record<string, boolean>; customized: string[] }[];
};

const ROLE_TONE: Record<string, string> = {
  SUPER_ADMIN: "bg-[#2a2012] text-[#e9d3a4]",
  ADMIN: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  BRANCH_MANAGER: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  SUPERVISOR: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  CASHIER: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  WAREHOUSE_MANAGER: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
  PURCHASE_MANAGER: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
};
const apiError = (e: any, f = "Something went wrong") => e?.response?.data?.errors?.[0]?.message || e?.response?.data?.message || e?.message || f;

export function UsersPermissions() {
  const [tab, setTab] = useState<"users" | "permissions">("users");
  const myRole = typeof window !== "undefined" ? localStorage.getItem("role") : null;
  return (
    <div className="min-h-full bg-[#f8f6f2]">
      <div className="border-b border-gray-200/70 bg-white">
        <div className="flex flex-col gap-4 px-4 py-5 md:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="hidden h-11 w-11 items-center justify-center rounded-xl bg-[#2a2012] text-[#e9d3a4] shadow-sm sm:flex">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a67c2e]">Security</p>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Users & permissions</h1>
              <p className="text-xs text-gray-500">Who can sign in, their role, and what each role is allowed to do</p>
            </div>
          </div>
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {(["users", "permissions"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn("rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-all", tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800")}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="px-4 py-5 md:px-6">{tab === "users" ? <UsersTab myRole={myRole} /> : <PermissionsTab canEdit={myRole === "SUPER_ADMIN"} />}</div>
    </div>
  );
}

/* ============================ users ============================ */

function UsersTab({ myRole }: { myRole: string | null }) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [editor, setEditor] = useState<{ open: boolean; user: UserRow | null }>({ open: false, user: null });

  const load = useCallback(async () => {
    try {
      const [u, b] = await Promise.all([apiClient.get("/users"), apiClient.get("/branches", { params: { limit: 100 } }).catch(() => null)]);
      setUsers(u.data.data.users);
      setRoles(u.data.data.roles);
      const list = b?.data?.data;
      setBranches(Array.isArray(list) ? list : Array.isArray(list?.data) ? list.data : []);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not load users", description: apiError(error) });
      setUsers([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () =>
      (users ?? []).filter(
        (u) =>
          (status === "all" || (status === "active" ? u.is_active : !u.is_active)) &&
          (roleFilter === "all" || u.role === roleFilter) &&
          (!search.trim() || [u.email, u.name, u.branch?.name].some((v) => (v || "").toLowerCase().includes(search.trim().toLowerCase()))),
      ),
    [users, status, roleFilter, search],
  );

  const toggleActive = async (u: UserRow) => {
    try {
      await apiClient.patch(`/users/${u.id}`, { is_active: !u.is_active });
      toast({ title: u.is_active ? "User deactivated" : "User activated", description: u.email });
      load();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not update user", description: apiError(error) });
    }
  };

  const roleLabel = (r: string) => roles.find((x) => x.role === r)?.label ?? r;

  return (
    <Panel
      icon={Users}
      title="Users"
      subtitle={users ? `${users.filter((u) => u.is_active).length} active · ${users.length} total` : "Loading…"}
      actions={
        <Button size="sm" className="h-9 bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={() => setEditor({ open: true, user: null })}>
          <UserPlus className="mr-1.5 h-4 w-4" />Add user
        </Button>
      }
    >
      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Login, name or branch…" className="max-w-xs" />
        <Chips
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: "Active", count: users?.filter((u) => u.is_active).length },
            { value: "inactive", label: "Deactivated", count: users?.filter((u) => !u.is_active).length },
            { value: "all", label: "All", count: users?.length },
          ]}
        />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="ml-auto h-9 w-[180px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roles.map((r) => <SelectItem key={r.role} value={r.role}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>
      {!users ? (
        <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Bone key={i} className="h-12 rounded-lg" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} title="No users match" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-5 py-2.5">User</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5">Branch</th>
                <th className="px-3 py-2.5">Last sign-in</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className={cn("border-b border-gray-50 hover:bg-gray-50/70", !u.is_active && "opacity-60")}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{u.name || u.email}</p>
                    <p className="text-[11px] text-gray-500">{u.name ? u.email : ""}{u.employee ? ` · employee: ${u.employee.name}` : ""}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", ROLE_TONE[u.role] || "bg-gray-100")}>{roleLabel(u.role)}</span>
                  </td>
                  <td className="px-3 py-3 text-gray-600">{u.branch?.name || <span className="text-gray-300">All branches</span>}</td>
                  <td className="px-3 py-3 text-gray-600">{u.last_login_at ? formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true }) : <span className="text-gray-300">Never</span>}</td>
                  <td className="px-3 py-3">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", u.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500")}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", u.is_active ? "bg-emerald-500" : "bg-gray-400")} />
                      {u.is_active ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditor({ open: true, user: u })}><Pencil className="mr-2 h-4 w-4" />Edit / reset password</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => toggleActive(u)} className={u.is_active ? "text-rose-600 focus:text-rose-700" : undefined}>
                          <Power className="mr-2 h-4 w-4" />{u.is_active ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <UserDialog
        open={editor.open}
        user={editor.user}
        roles={roles.filter((r) => myRole === "SUPER_ADMIN" || !["SUPER_ADMIN", "ADMIN"].includes(r.role))}
        branches={branches}
        onOpenChange={(o) => setEditor((e) => ({ ...e, open: o }))}
        onSaved={load}
      />
    </Panel>
  );
}

function UserDialog({
  open,
  user,
  roles,
  branches,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  user: UserRow | null;
  roles: RoleInfo[];
  branches: { id: string; name: string }[];
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("CASHIER");
  const [branchId, setBranchId] = useState("all");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail(user?.email ?? "");
    setName(user?.name ?? "");
    setRole(user?.role ?? "CASHIER");
    setBranchId(user?.branch?.id ?? "all");
    setPassword("");
  }, [open, user]);

  const save = async () => {
    setSaving(true);
    try {
      if (user) {
        await apiClient.patch(`/users/${user.id}`, {
          name: name.trim() || null,
          role,
          branch_id: branchId === "all" ? null : branchId,
          ...(password ? { password } : {}),
        });
      } else {
        await apiClient.post("/users", { email: email.trim(), name: name.trim() || undefined, password, role, branch_id: branchId === "all" ? null : branchId });
      }
      toast({ title: user ? "User updated" : "User created", description: email });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save user", description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  const roleInfo = roles.find((r) => r.role === role);
  const lockedRole = user && !roles.some((r) => r.role === user.role);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? "Edit user" : "Add user"}</DialogTitle>
          <DialogDescription>Staff sign in with this login. Their role decides what they can do.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Login (email or username@shop)</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!user} placeholder="ali@pehnawa.pk" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ali Raza" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <Select value={role} onValueChange={setRole} disabled={!!lockedRole}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(lockedRole && user ? [{ role: user.role, label: user.role, description: "" }, ...roles] : roles).map((r) => (
                    <SelectItem key={r.role} value={r.role}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Branch</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {roleInfo ? <p className="text-[11px] text-gray-500">{roleInfo.description}</p> : null}
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-xs"><KeyRound className="h-3 w-3" />{user ? "New password (leave empty to keep)" : "Password"}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 6 characters" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || (!user && (!email.trim() || password.length < 6)) || (!!password && password.length < 6)} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {user ? "Save" : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ permissions ============================ */

function PermissionsTab({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const [data, setData] = useState<Matrix | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get("/permissions")
      .then((r) => setData(r.data.data))
      .catch((error) => toast({ variant: "destructive", title: "Could not load permissions", description: apiError(error) }));
  }, [toast]);

  const toggle = async (role: string, key: string, allowed: boolean) => {
    setBusy(`${role}:${key}`);
    try {
      const r = await apiClient.put("/permissions", { role, permission: key, allowed });
      setData(r.data.data);
      loadPermissions(true);
    } catch (error) {
      toast({ variant: "destructive", title: "Could not change permission", description: apiError(error) });
    } finally {
      setBusy(null);
    }
  };

  const reset = async (role: string) => {
    setBusy(`${role}:reset`);
    try {
      const r = await apiClient.post("/permissions/reset", { role });
      setData(r.data.data);
      toast({ title: "Role reset to defaults" });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not reset", description: apiError(error) });
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <Bone className="h-96 rounded-xl" />;
  const groups = [...new Set(data.permissions.map((p) => p.group))];

  return (
    <Panel
      icon={ShieldCheck}
      title="Role permissions"
      subtitle={canEdit ? "Tick what each role may do. Users without a permission can still ask a manager to approve on the spot." : "Only the owner can change permissions."}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Permission</th>
              {data.roles.map((r) => {
                const grant = data.grants.find((g) => g.role === r.role);
                return (
                  <th key={r.role} className="px-2 py-3 text-center align-bottom">
                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold", ROLE_TONE[r.role])}>{r.label}</span>
                    {canEdit && grant && !grant.locked && grant.customized.length ? (
                      <button type="button" onClick={() => reset(r.role)} className="mt-1 flex w-full items-center justify-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-700" disabled={!!busy}>
                        <RotateCcw className="h-2.5 w-2.5" />reset
                      </button>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group}>
                <tr className="bg-[#fcf8f2]">
                  <td colSpan={data.roles.length + 1} className="px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8a6520]">{group}</td>
                </tr>
                {data.permissions
                  .filter((p) => p.group === group)
                  .map((p) => (
                    <tr key={p.key} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-gray-900">{p.label}</p>
                        <p className="text-[11px] text-gray-500">{p.description}</p>
                      </td>
                      {data.roles.map((r) => {
                        const grant = data.grants.find((g) => g.role === r.role)!;
                        const on = grant.allowed[p.key];
                        const custom = grant.customized.includes(p.key);
                        return (
                          <td key={r.role} className="px-2 py-2.5 text-center">
                            {grant.locked ? (
                              <Lock className="mx-auto h-3.5 w-3.5 text-gray-300" aria-label="Always allowed" />
                            ) : (
                              <div className="flex flex-col items-center gap-0.5">
                                <Switch
                                  checked={on}
                                  disabled={!canEdit || busy === `${r.role}:${p.key}`}
                                  onCheckedChange={(v) => toggle(r.role, p.key, v)}
                                />
                                {custom ? <span className="text-[9px] text-amber-600">changed</span> : null}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
