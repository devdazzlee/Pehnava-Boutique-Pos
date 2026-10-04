-- AlterTable
ALTER TABLE "Commission" ADD COLUMN     "adjustment" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "adjustment_note" TEXT,
ADD COLUMN     "base_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "paid_by" TEXT,
ADD COLUMN     "payment_method" TEXT,
ADD COLUMN     "payment_reference" TEXT;


-- Existing records: what was saved is the calculated amount.
UPDATE "Commission" SET "base_amount" = "amount";
