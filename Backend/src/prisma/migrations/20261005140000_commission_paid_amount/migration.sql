-- Partial commission payments (like salary paid_amount)
ALTER TABLE "Commission" ADD COLUMN IF NOT EXISTS "paid_amount" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- Backfill: already-paid rows count as fully paid
UPDATE "Commission"
SET "paid_amount" = "amount"
WHERE "is_paid" = true AND "paid_amount" = 0;
