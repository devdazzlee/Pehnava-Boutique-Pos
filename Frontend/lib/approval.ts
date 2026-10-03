/**
 * Manager approval bus. When the API answers 403 APPROVAL_REQUIRED, the axios
 * interceptor calls `requestApproval()`; the <ApprovalDialogHost /> mounted in the
 * dashboard shows a dialog and resolves with the manager's credentials (or null).
 */

export type ApprovalRequest = {
  label: string;
  message?: string;
  /** Set when a previous attempt used wrong / unauthorised credentials. */
  error?: string;
};

export type ApprovalCredentials = { email: string; password: string };

type Listener = (req: ApprovalRequest, resolve: (creds: ApprovalCredentials | null) => void) => void;

let listener: Listener | null = null;

export function onApprovalRequest(fn: Listener) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function requestApproval(req: ApprovalRequest): Promise<ApprovalCredentials | null> {
  if (!listener) return Promise.resolve(null);
  return new Promise((resolve) => listener!(req, resolve));
}

const b64 = (value: string) => {
  try {
    return window.btoa(unescape(encodeURIComponent(value)));
  } catch {
    return window.btoa(value);
  }
};

export function approvalHeaders(creds: ApprovalCredentials) {
  return { "X-Approver-Email": b64(creds.email.trim().toLowerCase()), "X-Approver-Password": b64(creds.password) };
}
