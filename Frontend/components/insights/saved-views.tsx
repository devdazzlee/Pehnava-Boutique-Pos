"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, BookmarkPlus, Loader2, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";

export type SavedView = { id: string; name: string; report: string; params: Record<string, unknown>; isShared: boolean; mine: boolean };

const apiError = (e: unknown) => {
  const err = e as { response?: { data?: { message?: string } }; message?: string };
  return err?.response?.data?.message || err?.message || "Something went wrong";
};

/** Save the current report + filters under a name, and reopen it later. */
export function SavedViews({ scope, current, onApply }: { scope: string; current: Record<string, unknown>; onApply: (params: Record<string, unknown>) => void }) {
  const { toast } = useToast();
  const [views, setViews] = useState<SavedView[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiClient
      .get("/finance/saved-reports", { params: { report: scope } })
      .then((r) => setViews(r.data.data))
      .catch(() => setViews([]));
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      await apiClient.post("/finance/saved-reports", { name: name.trim(), report: scope, params: current, isShared: shared });
      toast({ title: "View saved", description: name.trim() });
      setOpen(false);
      setName("");
      load();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save view", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (v: SavedView) => {
    if (!window.confirm(`Delete saved view "${v.name}"?`)) return;
    try {
      await apiClient.delete(`/finance/saved-reports/${v.id}`);
      load();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not delete", description: apiError(e) });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 bg-white">
            <Bookmark className="mr-1.5 h-4 w-4" />
            Saved views{views.length ? ` (${views.length})` : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            <BookmarkPlus className="mr-2 h-4 w-4 text-[#a67c2e]" />
            Save current view…
          </DropdownMenuItem>
          {views.length > 0 && <DropdownMenuSeparator />}
          {views.length > 0 && <DropdownMenuLabel className="text-xs text-stone-500">Open a saved view</DropdownMenuLabel>}
          {views.map((v) => (
            <DropdownMenuItem key={v.id} onSelect={() => onApply(v.params)} className="group flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{v.name}</span>
              {v.isShared && <Users className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-label="Shared" />}
              {v.mine && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    remove(v);
                  }}
                  className="rounded p-0.5 text-stone-400 hover:text-rose-600"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
            <DialogDescription>Saves the report, period and branch so you can open it again in one click.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Quarterly brand sales" autoFocus maxLength={80} />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2 text-sm">
              <span>
                Share with everyone
                <span className="block text-xs text-stone-500">Other users can open it (only you can delete it)</span>
              </span>
              <Switch checked={shared} onCheckedChange={setShared} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !name.trim()} className="bg-[#2a2012] hover:bg-[#3a2e1c]">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
