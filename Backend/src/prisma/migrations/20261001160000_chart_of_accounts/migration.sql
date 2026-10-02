-- CreateEnum
CREATE TYPE "BalanceSide" AS ENUM ('DEBIT', 'CREDIT');

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "account_id" TEXT;

-- AlterTable
ALTER TABLE "RecurringExpense" ADD COLUMN     "account_id" TEXT;

-- CreateTable
CREATE TABLE "AccountSubType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type_code" INTEGER NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountSubType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sub_type_id" TEXT NOT NULL,
    "description" TEXT,
    "system_key" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionalAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "control_id" TEXT NOT NULL,
    "contact_person" TEXT,
    "mobile" TEXT,
    "address" TEXT,
    "nic" TEXT,
    "ntn" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "opening_balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "opening_side" "BalanceSide" NOT NULL DEFAULT 'DEBIT',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "system_key" TEXT,
    "employee_id" TEXT,
    "supplier_id" TEXT,
    "expense_category_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalVoucher" (
    "id" TEXT NOT NULL,
    "voucher_no" TEXT NOT NULL,
    "voucher_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "narration" TEXT,
    "reference" TEXT,
    "branch_id" TEXT,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalVoucherLine" (
    "id" TEXT NOT NULL,
    "voucher_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "description" TEXT,
    "debit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "credit" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "JournalVoucherLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountSubType_code_key" ON "AccountSubType"("code");

-- CreateIndex
CREATE INDEX "AccountSubType_type_code_idx" ON "AccountSubType"("type_code");

-- CreateIndex
CREATE UNIQUE INDEX "ControlAccount_code_key" ON "ControlAccount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ControlAccount_system_key_key" ON "ControlAccount"("system_key");

-- CreateIndex
CREATE INDEX "ControlAccount_sub_type_id_idx" ON "ControlAccount"("sub_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionalAccount_code_key" ON "TransactionalAccount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionalAccount_system_key_key" ON "TransactionalAccount"("system_key");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionalAccount_employee_id_key" ON "TransactionalAccount"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionalAccount_supplier_id_key" ON "TransactionalAccount"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionalAccount_expense_category_id_key" ON "TransactionalAccount"("expense_category_id");

-- CreateIndex
CREATE INDEX "TransactionalAccount_control_id_idx" ON "TransactionalAccount"("control_id");

-- CreateIndex
CREATE INDEX "TransactionalAccount_is_active_idx" ON "TransactionalAccount"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "JournalVoucher_voucher_no_key" ON "JournalVoucher"("voucher_no");

-- CreateIndex
CREATE INDEX "JournalVoucher_voucher_date_idx" ON "JournalVoucher"("voucher_date");

-- CreateIndex
CREATE INDEX "JournalVoucher_branch_id_idx" ON "JournalVoucher"("branch_id");

-- CreateIndex
CREATE INDEX "JournalVoucherLine_voucher_id_idx" ON "JournalVoucherLine"("voucher_id");

-- CreateIndex
CREATE INDEX "JournalVoucherLine_account_id_idx" ON "JournalVoucherLine"("account_id");

-- CreateIndex
CREATE INDEX "Expense_account_id_idx" ON "Expense"("account_id");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "TransactionalAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "TransactionalAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlAccount" ADD CONSTRAINT "ControlAccount_sub_type_id_fkey" FOREIGN KEY ("sub_type_id") REFERENCES "AccountSubType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionalAccount" ADD CONSTRAINT "TransactionalAccount_control_id_fkey" FOREIGN KEY ("control_id") REFERENCES "ControlAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionalAccount" ADD CONSTRAINT "TransactionalAccount_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionalAccount" ADD CONSTRAINT "TransactionalAccount_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionalAccount" ADD CONSTRAINT "TransactionalAccount_expense_category_id_fkey" FOREIGN KEY ("expense_category_id") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalVoucherLine" ADD CONSTRAINT "JournalVoucherLine_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "JournalVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalVoucherLine" ADD CONSTRAINT "JournalVoucherLine_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "TransactionalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

