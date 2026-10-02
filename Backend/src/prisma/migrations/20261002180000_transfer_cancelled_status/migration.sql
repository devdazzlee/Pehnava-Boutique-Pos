-- Allow transfers to be cancelled (stock is returned to the source branch).
ALTER TYPE "TransferStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
