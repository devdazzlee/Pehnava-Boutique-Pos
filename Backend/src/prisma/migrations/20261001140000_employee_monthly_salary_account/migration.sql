-- Fixed monthly salary + optional bank account details on employees
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "monthly_salary" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bank_name" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "account_title" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "account_number" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "iban" TEXT;
