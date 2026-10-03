-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "bank_account_number" TEXT,
ADD COLUMN     "bank_account_title" TEXT,
ADD COLUMN     "bank_iban" TEXT,
ADD COLUMN     "bank_name" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "contact_person" TEXT,
ADD COLUMN     "credit_days" INTEGER,
ADD COLUMN     "credit_limit" DECIMAL(65,30),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "opening_balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "opening_balance_date" TIMESTAMP(3),
ADD COLUMN     "payment_terms" TEXT,
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "whatsapp_number" TEXT;

-- AlterTable
ALTER TABLE "SupplierPayment" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'PAYMENT';

