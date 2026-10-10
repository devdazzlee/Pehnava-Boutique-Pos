-- Freeze unit cost on each sale line so COGS stays historical (production POS pattern).
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "unit_cost" DECIMAL(65,30);
