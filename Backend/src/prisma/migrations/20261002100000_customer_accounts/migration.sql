-- CreateEnum
CREATE TYPE "CustomerTxnType" AS ENUM ('PAYMENT', 'ADVANCE', 'REFUND', 'CREDIT_NOTE', 'DEBIT_NOTE', 'WRITE_OFF');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "credit_days" INTEGER,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "CustomerPayment" ADD COLUMN     "sale_id" TEXT,
ADD COLUMN     "type" "CustomerTxnType" NOT NULL DEFAULT 'PAYMENT';

-- CreateIndex
CREATE INDEX "CustomerPayment_type_idx" ON "CustomerPayment"("type");

-- CreateIndex
CREATE INDEX "CustomerPayment_sale_id_idx" ON "CustomerPayment"("sale_id");

-- AddForeignKey
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

