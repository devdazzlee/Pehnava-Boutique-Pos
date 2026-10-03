"use client";

import * as XLSX from "xlsx";
import apiClient from "@/lib/apiClient";

/**
 * Report / export activity happens in the browser (Excel files, PDFs, print
 * windows), so the server cannot see it. This records those events in the audit
 * trail. Logging is best-effort and never blocks the export itself.
 */

export function logClientEvent(action: string, summary: string, details?: Record<string, unknown>) {
  try {
    if (!localStorage.getItem("token")) return;
  } catch {
    return;
  }
  apiClient.post("/audit/event", { action, summary: summary.slice(0, 300), details }).catch(() => undefined);
}

const screenName = () => {
  try {
    return new URLSearchParams(window.location.search).get("tab") || "dashboard";
  } catch {
    return "unknown";
  }
};

let installed = false;

/** Wraps XLSX.writeFile, jsPDF#save and window.print once for the whole app. */
export function installExportAuditing() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const xlsx = XLSX as unknown as { writeFile: (...args: unknown[]) => unknown };
  const originalWrite = xlsx.writeFile;
  if (typeof originalWrite === "function") {
    try {
      xlsx.writeFile = (...args: unknown[]) => {
        const file = String(args[1] ?? "export.xlsx");
        logClientEvent("export.excel", `Exported ${file} from ${screenName()}`, { file, screen: screenName() });
        return originalWrite.apply(XLSX, args);
      };
    } catch {
      // ES module namespace may be frozen; fall back to manual logging only.
    }
  }

  const originalPrint = window.print.bind(window);
  window.print = () => {
    logClientEvent("print.page", `Printed from ${screenName()}`, { screen: screenName() });
    originalPrint();
  };

  import("jspdf")
    .then((mod) => {
      const proto = (mod as any).jsPDF?.prototype ?? (mod as any).default?.prototype;
      if (!proto || proto.__auditWrapped) return;
      const originalSave = proto.save;
      proto.save = function (this: unknown, ...args: unknown[]) {
        const file = String(args[0] ?? "document.pdf");
        logClientEvent("export.pdf", `Downloaded ${file} from ${screenName()}`, { file, screen: screenName() });
        return originalSave.apply(this, args);
      };
      proto.__auditWrapped = true;
    })
    .catch(() => undefined);
}
