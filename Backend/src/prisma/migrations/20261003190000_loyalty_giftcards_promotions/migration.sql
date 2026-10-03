-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'GIFT_CARD';

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "applied_promotions" JSONB,
ADD COLUMN     "loyalty_discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "loyalty_points_earned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loyalty_points_redeemed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promotion_discount" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sale_id" TEXT,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "value" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "initial_value" DECIMAL(65,30) NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "customer_id" TEXT,
    "holder_name" TEXT,
    "holder_phone" TEXT,
    "expires_at" TIMESTAMP(3),
    "notes" TEXT,
    "branch_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardTransaction" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "payment_method" TEXT,
    "sale_id" TEXT,
    "cashflow_id" TEXT,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCardTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "value" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "buy_qty" INTEGER,
    "get_qty" INTEGER,
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "scope_ids" JSONB,
    "min_bill" DECIMAL(65,30),
    "max_discount" DECIMAL(65,30),
    "code" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3),
    "days_of_week" JSONB,
    "branch_ids" JSONB,
    "usage_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_customer_id_idx" ON "LoyaltyTransaction"("customer_id");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_sale_id_idx" ON "LoyaltyTransaction"("sale_id");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_created_at_idx" ON "LoyaltyTransaction"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_code_key" ON "GiftCard"("code");

-- CreateIndex
CREATE INDEX "GiftCard_status_idx" ON "GiftCard"("status");

-- CreateIndex
CREATE INDEX "GiftCard_customer_id_idx" ON "GiftCard"("customer_id");

-- CreateIndex
CREATE INDEX "GiftCardTransaction_card_id_idx" ON "GiftCardTransaction"("card_id");

-- CreateIndex
CREATE INDEX "GiftCardTransaction_sale_id_idx" ON "GiftCardTransaction"("sale_id");

-- CreateIndex
CREATE INDEX "GiftCardTransaction_created_at_idx" ON "GiftCardTransaction"("created_at");

-- CreateIndex
CREATE INDEX "Promotion_is_active_idx" ON "Promotion"("is_active");

-- CreateIndex
CREATE INDEX "Promotion_code_idx" ON "Promotion"("code");

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardTransaction" ADD CONSTRAINT "GiftCardTransaction_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardTransaction" ADD CONSTRAINT "GiftCardTransaction_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

