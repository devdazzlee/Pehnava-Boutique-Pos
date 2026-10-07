-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "custom_code" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_custom_code_idx" ON "Product"("custom_code");
