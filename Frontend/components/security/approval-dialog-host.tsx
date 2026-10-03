"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { onApprovalRequest, type ApprovalCredentials, type ApprovalRequest } from "@/lib/approval";

/** Shows "Manager approval" whenever the server needs a supervisor to authorise an action. */
export function ApprovalDialogHost() {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((c: ApprovalCredentials | null) => void) | null>(null);

  useEffect(
    () =>
      onApprovalRequest((req, resolve) => {
        resolver.current = resolve;
        setRequest(req);
        setPassword("");
        setBusy(false);
      }),
    [],
  );

  const finish = (creds: ApprovalCredentials | null) => {
    const r = resolver.current;
    resolver.current = null;
    setRequest(null);
    r?.(creds);
  };

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && finish(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-600" />
            Manager approval needed
          </DialogTitle>
          <DialogDescription>
            Your role is not allowed to <strong>{request?.label?.toLowerCase()}</strong>. A supervisor or manager can approve it with their login.
            The approval is saved in the audit trail.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim() || !password) return;
            setBusy(true);
            finish({ email: email.trim(), password });
          }}
        >
          {request?.error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{request.error}</p> : null}
          <div className="space-y-1">
            <Label className="text-xs">Manager login (email)</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" autoFocus />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Manager password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => finish(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !email.trim() || !password} className="bg-amber-600 hover:bg-amber-700">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Approve
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
