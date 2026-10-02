-- One Stock In save = one supplier bill (multiple product lines share bill_group_id).
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "bill_group_id" TEXT;

CREATE INDEX IF NOT EXISTS "Purchase_bill_group_id_idx" ON "Purchase"("bill_group_id");

-- Backfill: group lines that already share supplier + branch + invoice_ref + calendar day.
-- Rows without invoice_ref stay as single-line bills (safer than merging unrelated stock-ins).
UPDATE "Purchase" p
SET bill_group_id = g.gid
FROM (
  SELECT
    id,
    md5(
      supplier_id || '|' ||
      warehouse_branch_id || '|' ||
      coalesce(invoice_ref, '') || '|' ||
      to_char(purchase_date AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD')
    ) AS gid
  FROM "Purchase"
  WHERE bill_group_id IS NULL
    AND invoice_ref IS NOT NULL
    AND btrim(invoice_ref) <> ''
) g
WHERE p.id = g.id
  AND p.bill_group_id IS NULL;
