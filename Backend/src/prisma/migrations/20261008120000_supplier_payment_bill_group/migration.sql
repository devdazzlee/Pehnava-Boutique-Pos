-- Tie stock-in auto-payments to supplier bill groups for ledger sync on edit/delete.
ALTER TABLE "SupplierPayment" ADD COLUMN IF NOT EXISTS "bill_group_id" TEXT;

CREATE INDEX IF NOT EXISTS "SupplierPayment_bill_group_id_idx" ON "SupplierPayment"("bill_group_id");
