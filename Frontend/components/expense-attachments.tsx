"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ExternalLink, FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";

type Attachment = { id: string; url: string; name: string; mime_type: string | null; size: number | null; created_at: string };

const apiError = (e: unknown) => {
  const err = e as { response?: { data?: { message?: string } }; message?: string };
  return err?.response?.data?.message || err?.message || "Something went wrong";
};

const resolveUrl = (url: string) => {
  if (/^https?:\/\//.test(url)) return url;
  // Locally stored files are served by the API host.
  const base = (apiClient.defaults.baseURL || "").replace(/\/api(\/v\d+)?\/?$/, "");
  return `${base}${url}`;
};

const sizeLabel = (n: number | null) => (n == null ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Receipts / bills attached to one expense. */
export function ExpenseAttachments({ expenseId, onChange, compact }: { expenseId: string; onChange?: (count: number) => void; compact?: boolean }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiClient.get(`/finance/expenses/${expenseId}/attachments`);
      setItems(r.data.data);
      onChange?.(r.data.data.length);
    } catch {
      setItems([]);
    }
  }, [expenseId, onChange]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          toast({ variant: "destructive", title: `${file.name} is larger than 10 MB` });
          continue;
        }
        const form = new FormData();
        form.append("file", file);
        await apiClient.post(`/finance/expenses/${expenseId}/attachments`, form, { headers: { "Content-Type": "multipart/form-data" } });
      }
      toast({ title: "Receipt attached" });
      await load();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not attach", description: apiError(e) });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Remove this attachment?")) return;
    try {
      await apiClient.delete(`/finance/attachments/${id}`);
      await load();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not remove", description: apiError(e) });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => upload(e.target.files)} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => upload(e.target.files)} />
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
          Upload receipt
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => cameraRef.current?.click()} className="sm:hidden">
          <Camera className="mr-1.5 h-4 w-4" />
          Take photo
        </Button>
      </div>
      {items === null ? (
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No receipt attached yet. Photos (JPG/PNG) or PDF up to 10 MB.</p>
      ) : (
        <div className={cn("grid gap-2", compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3")}>
          {items.map((a) => {
            const isPdf = a.mime_type === "application/pdf" || a.url.toLowerCase().endsWith(".pdf");
            const url = resolveUrl(a.url);
            return (
              <div key={a.id} className="group relative overflow-hidden rounded-lg border bg-white">
                <a href={url} target="_blank" rel="noreferrer" className="block">
                  {isPdf ? (
                    <div className="flex h-24 items-center justify-center bg-stone-50">
                      <FileText className="h-8 w-8 text-rose-600" />
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={a.name} className="h-24 w-full object-cover" />
                  )}
                  <div className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-stone-600">
                    <span className="min-w-0 flex-1 truncate" title={a.name}>
                      {a.name}
                    </span>
                    <span className="shrink-0 text-stone-400">{sizeLabel(a.size)}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-stone-400" />
                  </div>
                </a>
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  title="Remove"
                  className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-stone-500 opacity-100 shadow-sm hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ExpenseAttachmentsDialog({
  expense,
  onOpenChange,
  onChange,
}: {
  expense: { id: string; particular: string } | null;
  onOpenChange: (open: boolean) => void;
  onChange?: () => void;
}) {
  return (
    <Dialog open={!!expense} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            Receipts
          </DialogTitle>
          <DialogDescription>{expense?.particular}</DialogDescription>
        </DialogHeader>
        {expense && <ExpenseAttachments expenseId={expense.id} onChange={onChange ? () => onChange() : undefined} />}
      </DialogContent>
    </Dialog>
  );
}
