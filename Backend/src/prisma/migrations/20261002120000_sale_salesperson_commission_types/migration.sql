-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENTAGE', 'FIXED_PER_SALE', 'FIXED_PER_PIECE');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "salesperson_id" TEXT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "commission_fixed" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "commission_type" "CommissionType" NOT NULL DEFAULT 'PERCENTAGE';

-- AlterTable
ALTER TABLE "Commission" ADD COLUMN     "commission_type" "CommissionType" NOT NULL DEFAULT 'PERCENTAGE',
ADD COLUMN     "fixed_amount" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Sale_salesperson_id_idx" ON "Sale"("salesperson_id");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

