-- CreateEnum
CREATE TYPE "AdvanceTxnType" AS ENUM ('ADVANCE', 'RECOVERY');

-- AlterTable
ALTER TABLE "Salary" ADD COLUMN     "advance_deduction" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "allowances" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "bonus" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "deductions" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "paid_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_method" TEXT,
ADD COLUMN     "reference" TEXT;

-- CreateTable
CREATE TABLE "EmployeeAdvance" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "type" "AdvanceTxnType" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "txn_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "notes" TEXT,
    "salary_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeAdvance_employee_id_idx" ON "EmployeeAdvance"("employee_id");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_txn_date_idx" ON "EmployeeAdvance"("txn_date");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_salary_id_idx" ON "EmployeeAdvance"("salary_id");

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_salary_id_fkey" FOREIGN KEY ("salary_id") REFERENCES "Salary"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: salaries already marked paid were paid in full (amount - advance taken)
UPDATE "Salary" SET "paid_amount" = GREATEST("amount" - "loan_amount", 0) WHERE "is_paid" = true AND "paid_amount" = 0;
