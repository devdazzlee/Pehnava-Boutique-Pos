-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "collection" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3),
ADD COLUMN     "voided_by" TEXT;

-- CreateTable
CREATE TABLE "SalePayment" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPriceHistory" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" DECIMAL(65,30) NOT NULL,
    "new_value" DECIMAL(65,30) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "changed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalePayment_sale_id_idx" ON "SalePayment"("sale_id");

-- CreateIndex
CREATE INDEX "SalePayment_method_idx" ON "SalePayment"("method");

-- CreateIndex
CREATE INDEX "ProductPriceHistory_product_id_idx" ON "ProductPriceHistory"("product_id");

-- CreateIndex
CREATE INDEX "ProductPriceHistory_created_at_idx" ON "ProductPriceHistory"("created_at");

-- AddForeignKey
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPriceHistory" ADD CONSTRAINT "ProductPriceHistory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: completed non-credit sales were paid at the counter, but the POS never stored the
-- amount received, so customer ledgers showed those bills as unpaid.
UPDATE "Sale"
SET "payment_received" = "total_amount"
WHERE "payment_received" = 0
  AND "payment_status" = 'PAID'
  AND "payment_method" <> 'CREDIT'
  AND "original_sale_id" IS NULL
  AND "total_amount" > 0;
