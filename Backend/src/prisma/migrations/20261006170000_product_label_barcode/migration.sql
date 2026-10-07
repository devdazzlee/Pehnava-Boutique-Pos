-- Custom label / scan barcode (optional, unique when set)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "label_barcode" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Product_label_barcode_key"
  ON "Product"("label_barcode")
  WHERE "label_barcode" IS NOT NULL;
