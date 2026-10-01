-- CreateEnum
CREATE TYPE "StockAdjustmentType" AS ENUM ('ADDITION', 'SUBTRACTION', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "StockAdjustmentCategory" AS ENUM ('CORRECTION', 'DAMAGE', 'EXPIRED', 'THEFT', 'RETURN_TO_SUPPLIER', 'ADMINISTRATIVE');

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "code" SET DEFAULT 'CAT-' || gen_random_uuid();

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "credit_limit" DECIMAL(65,30),
ADD COLUMN     "previous_credit_balance" DECIMAL(65,30) DEFAULT 0,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customer_email" TEXT,
ADD COLUMN     "customer_name" TEXT,
ADD COLUMN     "customer_phone" TEXT,
ADD COLUMN     "delivery_address" TEXT,
ADD COLUMN     "delivery_city" TEXT,
ADD COLUMN     "delivery_postal_code" TEXT,
ADD COLUMN     "order_notes" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ALTER COLUMN "grams_per_unit" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "is_finished_good" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_loose_item" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ShiftAssignment" ADD COLUMN     "break_time" TEXT DEFAULT '1 hour',
ADD COLUMN     "sales" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockAdjustment" ADD COLUMN     "adjustment_category" "StockAdjustmentCategory" NOT NULL DEFAULT 'CORRECTION',
ADD COLUMN     "adjustment_type" "StockAdjustmentType" NOT NULL DEFAULT 'RECONCILIATION',
ADD COLUMN     "change_quantity" DECIMAL(65,30),
ADD COLUMN     "reference_no" TEXT,
ALTER COLUMN "physical_count" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "carrier_name" TEXT,
ADD COLUMN     "estimated_arrival" TIMESTAMP(3),
ADD COLUMN     "reason" TEXT DEFAULT 'Stock Replenishment',
ADD COLUMN     "receiver_name" TEXT,
ADD COLUMN     "vehicle_no" TEXT;

-- CreateIndex
CREATE INDEX "StockAdjustment_adjustment_type_idx" ON "StockAdjustment"("adjustment_type");

-- CreateIndex
CREATE INDEX "StockAdjustment_adjustment_category_idx" ON "StockAdjustment"("adjustment_category");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_original_sale_id_fkey" FOREIGN KEY ("original_sale_id") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
