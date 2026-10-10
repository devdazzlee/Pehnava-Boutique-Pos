"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePrinterSettings } from "@/hooks/use-printer-settings";
import {
  deriveLabelLanguageHint,
  printBarcodeLabelsViaServer,
  printReceiptViaServer,
} from "@/lib/print-server";
import { PRINT_API_BASE } from "@/config/constants";
import {
  Printer,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Receipt,
  Barcode,
  Settings2,
  TestTube2,
  Wifi,
  WifiOff,
} from "lucide-react";

export function PrinterSettings() {
  const { toast } = useToast();
  const {
    printers,
    loading,
    receiptPrinter,
    barcodePrinter,
    setReceiptPrinter,
    setBarcodePrinter,
    getReceiptPrinterObj,
    getBarcodePrinterObj,
    refresh,
  } = usePrinterSettings();

  const [testingReceipt, setTestingReceipt] = useState(false);
  const [testingBarcode, setTestingBarcode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  /* Check print server health */
  const checkServer = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${PRINT_API_BASE}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      setServerOnline(data.status === "ok");
    } catch {
      setServerOnline(false);
    }
  };

  /* Refresh printer list */
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), checkServer()]);
    setRefreshing(false);
  };

  /* Test receipt printer */
  const testReceiptPrint = async () => {
    const printerObj = getReceiptPrinterObj();
    if (!printerObj) {
      toast({ variant: "destructive", title: "No receipt printer selected" });
      return;
    }
    setTestingReceipt(true);
    try {
      const result = await printReceiptViaServer(
        {
          name: printerObj.name,
          columns: printerObj.receiptProfile?.columns || { fontA: 48, fontB: 64 },
        },
        {
          storeName: "Pehnawa Boutique Pos",
          tagline: "Test Receipt",
          transactionId: `TEST-${Date.now()}`,
          timestamp: new Date().toISOString(),
          items: [
            { name: "Test Item 1", quantity: 1, price: 100 },
            { name: "Test Item 2", quantity: 2, price: 200 },
          ],
          subtotal: 500,
          total: 500,
          paymentMethod: "Cash",
          amountPaid: 500,
          changeAmount: 0,
          thankYouMessage: "Printer test successful!",
        },
        { copies: 1, cut: true, openDrawer: false }
      );
      if (result.success) {
        toast({
          title: "Test receipt sent",
          description: `Printer: ${printerObj.name}`,
        });
      } else {
        throw new Error(result.error);
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Test failed",
        description: err.message || "Could not print test receipt.",
      });
    } finally {
      setTestingReceipt(false);
    }
  };

  /* Test barcode printer */
  const testBarcodePrint = async () => {
    if (!barcodePrinter) {
      toast({ variant: "destructive", title: "No barcode printer selected" });
      return;
    }
    setTestingBarcode(true);
    try {
      const printerObj = getBarcodePrinterObj();
      const languageHint = deriveLabelLanguageHint(
        barcodePrinter,
        printerObj?.languageHint,
      );
      if (languageHint !== "epl" && languageHint !== "zpl") {
        throw new Error(
          `"${barcodePrinter}" is not a label printer (EPL/ZPL). Select Zebra UPS 2844 or another label printer.`,
        );
      }
      const result = await printBarcodeLabelsViaServer({
        printerName: barcodePrinter,
        items: [
          {
            id: "test",
            name: "Test Product",
            barcode: "TEST123456",
            netWeight: "100g",
            price: 250,
            packageDateISO: new Date().toISOString(),
            expiryDateISO: new Date(
              Date.now() + 180 * 24 * 60 * 60 * 1000
            ).toISOString(),
          },
        ],
        paperSize: "50x25mm",
        labelGapMM: 3,
        copies: 1,
        dpi: 203,
        humanReadable: true,
        printMode: "raw",
        languageHint,
      });

      if (!result.success) {
        throw new Error(result.error || "Barcode print failed");
      }
      toast({
        title: "Test label printed",
        description: result.message || `Printer: ${barcodePrinter}`,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Test failed",
        description: err.message || "Could not print test barcode.",
      });
    } finally {
      setTestingBarcode(false);
    }
  };

  // First load – also check server
  useState(() => {
    checkServer();
  });

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-blue-600" />
            Printer Settings
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure receipt &amp; barcode printers globally — applies across
            the entire POS system.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh Printers
        </Button>
      </div>

      {/* Server status */}
      <Card className="border-none shadow-sm">
        <CardContent className="py-4 flex items-center gap-3">
          {serverOnline === null ? (
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          ) : serverOnline ? (
            <Wifi className="h-5 w-5 text-green-600" />
          ) : (
            <WifiOff className="h-5 w-5 text-red-500" />
          )}
          <div>
            <p className="text-sm font-medium text-gray-900">
              Local Print Server{" "}
              {serverOnline === null
                ? "— checking…"
                : serverOnline
                ? "— Connected"
                : "— Offline"}
            </p>
            <p className="text-xs text-gray-500">
              {serverOnline
                ? `Running at ${PRINT_API_BASE}`
                : "Start the Print Server on this machine to enable direct printing."}
            </p>
          </div>
          {serverOnline !== null && (
            <Badge
              variant="outline"
              className={
                serverOnline
                  ? "ml-auto bg-green-50 text-green-700 border-green-200"
                  : "ml-auto bg-red-50 text-red-700 border-red-200"
              }
            >
              {serverOnline ? "Online" : "Offline"}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Receipt Printer Card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="p-2 rounded-lg bg-blue-50">
              <Receipt className="h-5 w-5 text-blue-600" />
            </div>
            Sale Receipt Printer
          </CardTitle>
          <p className="text-sm text-gray-500">
            Used for all customer bills, receipts, and sale prints across Sales,
            Orders, and Sales History.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Select
                value={receiptPrinter || undefined}
                onValueChange={setReceiptPrinter}
                disabled={loading || printers.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={loading ? "Loading printers…" : "Select receipt printer"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {printers.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      <span className="flex items-center gap-2">
                        <Printer className="h-3.5 w-3.5" />
                        {p.name}
                        {p.isDefault && (
                          <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">
                            Default
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={testReceiptPrint}
              disabled={testingReceipt || !receiptPrinter}
              className="flex items-center gap-2 min-w-[140px]"
            >
              {testingReceipt ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube2 className="h-4 w-4" />
              )}
              Test Print
            </Button>
          </div>
          {receiptPrinter && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                <strong>{receiptPrinter}</strong> will be used for all receipt
                printing.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Barcode Printer Card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="p-2 rounded-lg bg-purple-50">
              <Barcode className="h-5 w-5 text-purple-600" />
            </div>
            Barcode Label Printer
          </CardTitle>
          <p className="text-sm text-gray-500">
            Used for barcode / sticker label printing in the Barcode Generator
            section.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Select
                value={barcodePrinter || undefined}
                onValueChange={setBarcodePrinter}
                disabled={loading || printers.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={loading ? "Loading printers…" : "Select barcode printer"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {printers.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      <span className="flex items-center gap-2">
                        <Printer className="h-3.5 w-3.5" />
                        {p.name}
                        {p.isDefault && (
                          <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">
                            Default
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={testBarcodePrint}
              disabled={testingBarcode || !barcodePrinter}
              className="flex items-center gap-2 min-w-[140px]"
            >
              {testingBarcode ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube2 className="h-4 w-4" />
              )}
              Test Print
            </Button>
          </div>
          {barcodePrinter && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 rounded-lg px-3 py-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  <strong>{barcodePrinter}</strong> will be used for all barcode
                  label printing.
                </span>
              </div>
              {getBarcodePrinterObj()?.languageHint === "epl" && (
                <p className="text-xs text-gray-600 leading-relaxed px-1">
                  Detected <strong>Eltron LP 2844 (EPL)</strong>: labels print
                  directly at <strong>50×25 mm</strong> (3 mm gap), 203 DPI — no browser
                  dialog. Use EPL driver in Windows (not ZPL). See{" "}
                  <code className="text-[11px]">PrintServer/LP2844-SETUP.txt</code>.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {printers.length === 1 && printers[0]?.name === "Default Printer" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900">
          <strong>Printers not detected.</strong> The print server is online but
          only shows a placeholder. On the <strong>same PC</strong> where your
          receipt and LP 2844 are installed: right-click{" "}
          <code className="text-xs">PrintServer/SETUP-CLIENT-LAPTOP.bat</code> →
          Run as administrator, then click <strong>Refresh Printers</strong>.
          Or stop the Windows service and run{" "}
          <code className="text-xs">node server.js</code> in the PrintServer folder
          while logged in as your user.
        </div>
      )}

      {/* Available Printers */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Printer className="h-5 w-5 text-gray-600" />
            Available Printers ({printers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning for printers…
            </div>
          ) : printers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
              <XCircle className="h-10 w-10" />
              <p className="text-sm">No printers detected.</p>
              <p className="text-xs">
                Make sure the print server is running and printers are
                connected.
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              {printers.map((p) => {
                const isReceipt = receiptPrinter === p.name;
                const isBarcode = barcodePrinter === p.name;
                return (
                  <div
                    key={p.name}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition ${
                      isReceipt || isBarcode
                        ? "border-blue-200 bg-blue-50/40"
                        : "border-gray-100"
                    }`}
                  >
                    <Printer className="h-4 w-4 text-gray-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {p.name}
                      </p>
                      {p.receiptProfile?.roll && (
                        <p className="text-xs text-gray-500">
                          Roll: {p.receiptProfile.roll}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {p.isDefault && (
                        <Badge variant="outline" className="text-[10px] bg-gray-50 border-gray-200">
                          System Default
                        </Badge>
                      )}
                      {p.status === "available" && (
                        <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                          Available
                        </Badge>
                      )}
                      {p.status === "offline" && (
                        <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200">
                          Offline
                        </Badge>
                      )}
                      {isReceipt && (
                        <Badge className="text-[10px] bg-blue-600 text-white border-blue-600 hover:bg-blue-600">
                          Receipt
                        </Badge>
                      )}
                      {isBarcode && (
                        <Badge className="text-[10px] bg-purple-600 text-white border-purple-600 hover:bg-purple-600">
                          Barcode
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tip */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex gap-2">
        <span className="text-lg leading-none">💡</span>
        <span>
          <strong>Tip:</strong> Changes are saved automatically and apply
          everywhere in the POS — you don't need to select the printer again on
          other screens.
        </span>
      </div>
    </div>
  );
}
