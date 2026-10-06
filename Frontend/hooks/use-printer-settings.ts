"use client";

import { useState, useEffect, useCallback } from "react";
import { getPrinters } from "@/lib/print-server";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export interface PrinterInfo {
  name: string;
  isDefault?: boolean;
  status?: string;
  receiptProfile?: {
    roll?: string;
    printableWidthMM?: number;
    columns?: { fontA: number; fontB: number };
  };
  languageHint?: string;
  labelProfile?: {
    paperSize?: string;
    widthMM?: number;
    heightMM?: number;
    dpi?: number;
    language?: string;
    model?: string;
  };
  [key: string]: any; // extra fields the server may return
}

function isLp2844OrEplPrinter(p: PrinterInfo): boolean {
  const s = `${p.name || ''} ${p.driver?.name || ''}`.toLowerCase();
  return (
    p.languageHint === 'epl' ||
    /\(epl\)|eltron|\blp\s*2844\b|lp2844|ups lp/.test(s)
  );
}

export interface PrinterSettings {
  receiptPrinter: string | null; // name of receipt printer
  barcodePrinter: string | null; // name of barcode printer
}

const STORAGE_KEY = "pos_printer_settings";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function loadSettings(): PrinterSettings {
  if (typeof window === "undefined") return { receiptPrinter: null, barcodePrinter: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PrinterSettings;
  } catch {}
  return { receiptPrinter: null, barcodePrinter: null };
}

function persistSettings(s: PrinterSettings) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */
export function usePrinterSettings() {
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<PrinterSettings>(loadSettings);

  /* Fetch available printers from print-server / backend */
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getPrinters();
      if (result.success && result.data) {
        const list = result.data as PrinterInfo[];
        setPrinters(list);

        setSettings((prev) => {
          const defaultP = list.find((p) => p.isDefault) || list[0];
          const updated = { ...prev };

          // A saved selection can go stale — the printer might have been
          // uninstalled, or (before the server started filtering them out)
          // it might have been a virtual printer like "Microsoft Print to
          // PDF", which always pops a native Save dialog and can never
          // support unattended auto-print. Re-pick a real default instead
          // of trusting a name that no longer exists in the current list.
          const receiptStillValid =
            !!prev.receiptPrinter && list.some((p) => p.name === prev.receiptPrinter);
          const barcodeStillValid =
            !!prev.barcodePrinter && list.some((p) => p.name === prev.barcodePrinter);

          if (!receiptStillValid && defaultP) updated.receiptPrinter = defaultP.name;
          if (!barcodeStillValid) {
            const labelPrinter =
              list.find(isLp2844OrEplPrinter) ||
              list.find((p) => p.languageHint === 'epl' || p.languageHint === 'zpl') ||
              defaultP;
            if (labelPrinter) updated.barcodePrinter = labelPrinter.name;
          }

          if (updated.receiptPrinter !== prev.receiptPrinter || updated.barcodePrinter !== prev.barcodePrinter) {
            persistSettings(updated);
          }
          return updated;
        });
      }
    } catch (err) {
      console.error("Failed to load printers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /* Setters */
  const setReceiptPrinter = useCallback((name: string) => {
    setSettings((prev) => {
      const next = { ...prev, receiptPrinter: name };
      persistSettings(next);
      return next;
    });
  }, []);

  const setBarcodePrinter = useCallback((name: string) => {
    setSettings((prev) => {
      const next = { ...prev, barcodePrinter: name };
      persistSettings(next);
      return next;
    });
  }, []);

  /* Convenience getters that return full PrinterInfo objects */
  const getReceiptPrinterObj = useCallback((): PrinterInfo | null => {
    if (!settings.receiptPrinter) return null;
    return printers.find((p) => p.name === settings.receiptPrinter) ?? { name: settings.receiptPrinter };
  }, [printers, settings.receiptPrinter]);

  const getBarcodePrinterObj = useCallback((): PrinterInfo | null => {
    if (!settings.barcodePrinter) return null;
    return printers.find((p) => p.name === settings.barcodePrinter) ?? { name: settings.barcodePrinter };
  }, [printers, settings.barcodePrinter]);

  return {
    printers,
    loading,
    settings,
    receiptPrinter: settings.receiptPrinter,
    barcodePrinter: settings.barcodePrinter,
    setReceiptPrinter,
    setBarcodePrinter,
    getReceiptPrinterObj,
    getBarcodePrinterObj,
    refresh,
  };
}
