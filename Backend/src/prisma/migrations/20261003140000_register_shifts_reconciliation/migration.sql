-- AlterTable
ALTER TABLE "CashFlow" ADD COLUMN     "closing_count" JSONB,
ADD COLUMN     "expected_opening" DECIMAL(65,30),
ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locked_reason" TEXT,
ADD COLUMN     "opening_count" JSONB,
ADD COLUMN     "opening_note" TEXT,
ADD COLUMN     "opening_variance" DECIMAL(65,30),
ADD COLUMN     "review_note" TEXT,
ADD COLUMN     "review_status" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" TEXT,
ADD COLUMN     "variance_approved_by" TEXT,
ADD COLUMN     "variance_note" TEXT;

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "cashflow_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'IN',
    "amount" DECIMAL(65,30) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" TEXT,
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegisterShift" (
    "id" TEXT NOT NULL,
    "cashflow_id" TEXT NOT NULL,
    "cashier_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "start_count" DECIMAL(65,30) NOT NULL,
    "end_count" DECIMAL(65,30),
    "expected_end" DECIMAL(65,30),
    "variance" DECIMAL(65,30),
    "start_note" TEXT,
    "end_note" TEXT,
    "confirmed_by_incoming" BOOLEAN NOT NULL DEFAULT false,
    "approved_by" TEXT,
    "ended_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegisterShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegisterReconciliation" (
    "id" TEXT NOT NULL,
    "cashflow_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "expected" DECIMAL(65,30) NOT NULL,
    "actual" DECIMAL(65,30) NOT NULL,
    "variance" DECIMAL(65,30) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "reconciled_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegisterReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashMovement_cashflow_id_idx" ON "CashMovement"("cashflow_id");

-- CreateIndex
CREATE INDEX "RegisterShift_cashflow_id_idx" ON "RegisterShift"("cashflow_id");

-- CreateIndex
CREATE INDEX "RegisterShift_cashier_id_idx" ON "RegisterShift"("cashier_id");

-- CreateIndex
CREATE UNIQUE INDEX "RegisterReconciliation_cashflow_id_method_key" ON "RegisterReconciliation"("cashflow_id", "method");

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashflow_id_fkey" FOREIGN KEY ("cashflow_id") REFERENCES "CashFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegisterShift" ADD CONSTRAINT "RegisterShift_cashflow_id_fkey" FOREIGN KEY ("cashflow_id") REFERENCES "CashFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegisterReconciliation" ADD CONSTRAINT "RegisterReconciliation_cashflow_id_fkey" FOREIGN KEY ("cashflow_id") REFERENCES "CashFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

