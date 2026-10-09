export function parsePurchaseNotes(notes?: string | null) {
  if (!notes) {
    return { batchNo: "", expiryDate: "", source: "", payment: "", userNotes: "" };
  }
  const parts = notes.split(" | ");
  let batchNo = "";
  let expiryDate = "";
  let source = "";
  let payment = "";
  const remaining: string[] = [];
  parts.forEach((p) => {
    if (p.startsWith("Batch: ")) {
      batchNo = p.replace("Batch: ", "");
    } else if (p.startsWith("Expiry: ")) {
      expiryDate = p.replace("Expiry: ", "");
    } else if (p.startsWith("Source: ")) {
      source = p.replace("Source: ", "");
    } else if (p.startsWith("Pay:")) {
      payment = p.replace(/^Pay:\s*/, "");
    } else if (p.trim()) {
      remaining.push(p);
    }
  });
  return {
    batchNo,
    expiryDate,
    source,
    payment,
    userNotes: remaining.join(" | "),
  };
}

export function buildPurchaseNotes(parts: {
  batchNo?: string;
  expiryDate?: string;
  source?: string;
  payment?: string;
  userNotes?: string;
}) {
  const out: string[] = [];
  if (parts.batchNo?.trim()) out.push(`Batch: ${parts.batchNo.trim()}`);
  if (parts.expiryDate?.trim()) out.push(`Expiry: ${parts.expiryDate.trim()}`);
  if (parts.source?.trim()) out.push(`Source: ${parts.source.trim()}`);
  if (parts.userNotes?.trim()) out.push(parts.userNotes.trim());
  if (parts.payment?.trim()) out.push(`Pay: ${parts.payment.trim()}`);
  return out.length ? out.join(" | ") : null;
}
