import { format } from "date-fns";

const GOLD: [number, number, number] = [166, 124, 46];
const INK: [number, number, number] = [42, 32, 18];
const MUTED: [number, number, number] = [120, 100, 72];
const CREAM: [number, number, number] = [252, 248, 242];
const LINE: [number, number, number] = [232, 220, 196];
const WHITE: [number, number, number] = [255, 255, 255];

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  ONLINE: "Online payment",
  OTHER: "Other",
};

const TYPE_LABELS: Record<string, string> = {
  SALE: "Sale",
  RETURN: "Return",
  EXCHANGE: "Exchange",
  REFUND: "Refund",
  CASH_OUT: "Cash out",
  CUSTOMER_PAYMENT: "Customer payment",
  CUSTOMER_REFUND: "Customer refund",
};

interface PdfReport {
  period: { from: string; to: string };
  registerStatus: string;
  sessions: {
    registerName: string;
    registerNumber: string;
    cashierName: string;
    status: string;
    opening: number;
    closing: number | null;
    variance?: number | null;
    varianceLabel?: string | null;
  }[];
  salesSummary: {
    saleCount: number;
    grossSales: number;
    discounts: number;
    returns: number;
    netSales: number;
    tax: number;
    finalSales: number;
  };
  payments: { method: string; count: number; amount: number }[];
  cash: {
    openingCash: number;
    cashSales: number;
    cashRefunds: number;
    cashReceived: number;
    cashPaidOut: number;
    cashDeposits: number;
    expectedCash: number;
    actualClosing: number | null;
    difference: number | null;
    variance: string | null;
  };
}

interface PdfRow {
  number: string;
  date: string;
  customer: string;
  cashier: string;
  type: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  status: string;
}

const money = (value: number | null | undefined) =>
  value == null
    ? "—"
    : `PKR ${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const periodLabel = (from: string, to: string) =>
  `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;

const loadLogo = async () => {
  const res = await fetch("/logo.png");
  if (!res.ok) return "";
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("logo"));
    reader.readAsDataURL(blob);
  });
};

const clip = (doc: { getTextWidth: (text: string) => number }, text: string, maxW: number) => {
  let value = text || "—";
  if (doc.getTextWidth(value) <= maxW) return value;
  while (value.length > 1 && doc.getTextWidth(`${value}…`) > maxW) {
    value = value.slice(0, -1);
  }
  return `${value}…`;
};

export async function downloadRegisterReportPdf(report: PdfReport, rows: PdfRow[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const usable = pageWidth - margin * 2;
  let logo = "";
  try {
    logo = await loadLogo();
  } catch {
    logo = "";
  }

  const drawFooter = () => {
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text("Pehnawa Boutique Pos  ·  Confidential register report", margin, pageHeight - 6);
      doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
    }
  };

  const drawHeader = (continued: boolean) => {
    doc.setFillColor(...CREAM);
    doc.rect(0, 0, pageWidth, continued ? 18 : 32, "F");
    doc.setFillColor(...GOLD);
    doc.rect(0, continued ? 18 : 32, pageWidth, 1.2, "F");

    let textX = margin;
    if (logo) {
      const imgH = continued ? 10 : 16;
      const imgW = imgH * (330 / 67);
      doc.addImage(logo, "PNG", margin, continued ? 4 : 8, imgW, imgH);
      textX = margin + imgW + 8;
    }

    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(continued ? 12 : 16);
    doc.text("Register Report", textX, continued ? 11 : 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(continued ? "Transactions continued" : "Pehnawa Boutique Pos", textX, continued ? 15.5 : 22);

    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(periodLabel(report.period.from, report.period.to), pageWidth - margin, continued ? 10 : 14, { align: "right" });
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Generated ${format(new Date(), "dd MMM yyyy, HH:mm")}`, pageWidth - margin, continued ? 15 : 19, { align: "right" });
    return continued ? 24 : 40;
  };

  let y = drawHeader(false);

  const registerLine =
    report.sessions.length === 0
      ? "No register session in this period"
      : report.sessions
          .map(
            (session) =>
              `${session.registerName} (${session.registerNumber}) · ${session.cashierName} · ${
                session.status === "OPEN"
                  ? "Open"
                  : session.variance != null
                    ? `${session.varianceLabel || "Closed"} ${money(session.variance)}`
                    : "Closed"
              }`,
          )
          .join("   |   ");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(clip(doc, registerLine, usable), margin, y);
  y += 6;

  const cards: { label: string; value: string; emphasis?: boolean }[] = [
    { label: "Opening cash", value: money(report.cash.openingCash) },
    { label: "Gross sales", value: money(report.salesSummary.grossSales) },
    { label: "Net sales", value: money(report.salesSummary.netSales), emphasis: true },
    { label: "Cash sales", value: money(report.cash.cashSales) },
    { label: "Other payments", value: money(report.payments.filter((row) => row.method !== "CASH").reduce((sum, row) => sum + row.amount, 0)) },
    { label: "Refunds", value: money(report.salesSummary.returns) },
    { label: "Expected cash", value: money(report.cash.expectedCash), emphasis: true },
    { label: "Actual cash", value: money(report.cash.actualClosing) },
    { label: "Variance", value: `${money(report.cash.difference)}${report.cash.variance ? `  ${report.cash.variance}` : ""}` },
  ];

  const gap = 2.5;
  const cols = 5;
  const boxW = (usable - gap * (cols - 1)) / cols;
  const boxH = 16;
  cards.forEach((card, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = margin + col * (boxW + gap);
    const top = y + row * (boxH + gap);
    doc.setFillColor(...WHITE);
    doc.setDrawColor(...LINE);
    doc.roundedRect(x, top, boxW, boxH, 1.4, 1.4, "FD");
    doc.setFillColor(...GOLD);
    doc.rect(x, top, 1.1, boxH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(card.label.toUpperCase(), x + 3.2, top + 5.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...(card.emphasis ? GOLD : INK));
    doc.text(clip(doc, card.value, boxW - 6), x + 3.2, top + 11.5);
  });
  y += boxH * 2 + gap + 8;

  const section = (title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(title, margin, y);
    y += 1.5;
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.4);
    doc.line(margin, y, margin + 28, y);
    y += 4;
  };

  const leftW = usable * 0.46;
  const rightX = margin + leftW + 8;
  const rightW = usable - leftW - 8;
  const blockTop = y;

  section("Payment methods");
  const payHeader = y;
  doc.setFillColor(...INK);
  doc.rect(margin, payHeader, leftW, 7, "F");
  doc.setTextColor(...WHITE);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Method", margin + 2, payHeader + 4.6);
  doc.text("Txns", margin + leftW * 0.62, payHeader + 4.6);
  doc.text("Amount", margin + leftW - 2, payHeader + 4.6, { align: "right" });
  y = payHeader + 7;
  report.payments.forEach((row, index) => {
    if (index % 2 === 0) {
      doc.setFillColor(...CREAM);
      doc.rect(margin, y, leftW, 6.4, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text(PAYMENT_LABELS[row.method] || row.method, margin + 2, y + 4.3);
    doc.text(String(row.count), margin + leftW * 0.62, y + 4.3);
    doc.text(money(row.amount), margin + leftW - 2, y + 4.3, { align: "right" });
    y += 6.4;
  });
  const leftBottom = y;

  const cashLines: [string, string][] = [
    ["Opening cash", money(report.cash.openingCash)],
    ["Cash sales", money(report.cash.cashSales)],
    ["Cash received", money(report.cash.cashReceived)],
    ["Cash deposits", money(report.cash.cashDeposits)],
    ["Cash refunds", money(report.cash.cashRefunds)],
    ["Cash paid out", money(report.cash.cashPaidOut)],
    ["Expected cash", money(report.cash.expectedCash)],
    ["Actual closing cash", money(report.cash.actualClosing)],
    ["Difference", `${money(report.cash.difference)}  ${report.cash.variance || "Not closed"}`],
  ];
  y = blockTop;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text("Cash movement", rightX, y);
  y += 1.5;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(rightX, y, rightX + 32, y);
  y += 4;
  cashLines.forEach((line, index) => {
    const last = index === cashLines.length - 1;
    doc.setFont("helvetica", last ? "bold" : "normal");
    doc.setFontSize(8);
    doc.setTextColor(...(last ? GOLD : MUTED));
    doc.text(line[0], rightX, y + 4);
    doc.setTextColor(...(last ? GOLD : INK));
    doc.text(line[1], rightX + rightW, y + 4, { align: "right" });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.15);
    doc.line(rightX, y + 6, rightX + rightW, y + 6);
    y += 6.2;
  });

  y = Math.max(leftBottom, y) + 8;

  const columns = [
    { label: "Number", weight: 1.35 },
    { label: "Date", weight: 1.45 },
    { label: "Customer", weight: 1.25 },
    { label: "Cashier", weight: 1.15 },
    { label: "Type", weight: 1.05 },
    { label: "Subtotal", weight: 0.95, right: true },
    { label: "Discount", weight: 0.9, right: true },
    { label: "Tax", weight: 0.75, right: true },
    { label: "Total", weight: 1, right: true },
    { label: "Payment", weight: 1.05 },
    { label: "Status", weight: 0.85 },
  ];
  const weightSum = columns.reduce((sum, column) => sum + column.weight, 0);
  const widths = columns.map((column) => (column.weight / weightSum) * usable);
  const rowH = 6.2;

  const drawTableHead = () => {
    doc.setFillColor(...INK);
    doc.rect(margin, y, usable, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...WHITE);
    let x = margin;
    columns.forEach((column, index) => {
      const pad = column.right ? widths[index] - 1.5 : 1.5;
      doc.text(column.label, x + pad, y + 4.6, { align: column.right ? "right" : "left" });
      x += widths[index];
    });
    y += 7;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text("Transactions", margin, y);
  y += 4;
  drawTableHead();

  if (rows.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("No transactions in this period.", margin, y + 6);
  }

  rows.forEach((row, index) => {
    if (y + rowH > pageHeight - 16) {
      doc.addPage();
      y = drawHeader(true);
      drawTableHead();
    }
    if (index % 2 === 0) {
      doc.setFillColor(...CREAM);
      doc.rect(margin, y, usable, rowH, "F");
    }
    const cells = [
      row.number,
      format(new Date(row.date), "dd MMM yyyy HH:mm"),
      row.customer,
      row.cashier,
      TYPE_LABELS[row.type] || row.type,
      money(row.subtotal),
      money(row.discount),
      money(row.tax),
      money(row.total),
      PAYMENT_LABELS[row.paymentMethod] || row.paymentMethod,
      row.status,
    ];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(...INK);
    let x = margin;
    cells.forEach((cell, cellIndex) => {
      const right = columns[cellIndex].right;
      const pad = right ? widths[cellIndex] - 1.5 : 1.5;
      doc.text(clip(doc, String(cell), widths[cellIndex] - 3), x + pad, y + 4.2, { align: right ? "right" : "left" });
      x += widths[cellIndex];
    });
    y += rowH;
  });

  drawFooter();
  doc.save(`register-report-${report.period.from}-to-${report.period.to}.pdf`);
}
