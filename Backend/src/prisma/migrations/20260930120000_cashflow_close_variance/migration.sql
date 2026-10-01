-- Register close stores the expected cash and variance with the session.
ALTER TABLE "CashFlow" ADD COLUMN "expected_cash" DECIMAL(65,30),
ADD COLUMN "variance" DECIMAL(65,30),
ADD COLUMN "closed_by" TEXT;

ALTER TABLE "CashFlow" ADD CONSTRAINT "CashFlow_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
