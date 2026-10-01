-- Link employees to POS users for commission; salary loans; commission payroll
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "commission_rate" DECIMAL(65,30) NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Employee_user_id_fkey'
  ) THEN
    ALTER TABLE "Employee"
      ADD CONSTRAINT "Employee_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_user_id_key" ON "Employee"("user_id");

ALTER TABLE "Salary" ADD COLUMN IF NOT EXISTS "loan_amount" DECIMAL(65,30) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Salary_paid_date_idx" ON "Salary"("paid_date");
CREATE INDEX IF NOT EXISTS "Salary_is_paid_idx" ON "Salary"("is_paid");

CREATE TABLE IF NOT EXISTS "Commission" (
  "id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "sales_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "pieces" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "bills" INTEGER NOT NULL DEFAULT 0,
  "rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "is_paid" BOOLEAN NOT NULL DEFAULT false,
  "paid_date" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Commission_employee_id_fkey'
  ) THEN
    ALTER TABLE "Commission"
      ADD CONSTRAINT "Commission_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "Employee"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Commission_employee_id_month_year_key"
  ON "Commission"("employee_id", "month", "year");
CREATE INDEX IF NOT EXISTS "Commission_employee_id_idx" ON "Commission"("employee_id");
CREATE INDEX IF NOT EXISTS "Commission_paid_date_idx" ON "Commission"("paid_date");
CREATE INDEX IF NOT EXISTS "Commission_is_paid_idx" ON "Commission"("is_paid");
