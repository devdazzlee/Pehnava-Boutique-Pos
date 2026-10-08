"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertCashRegisterOpenForSale = assertCashRegisterOpenForSale;
const client_1 = require("../prisma/client");
const apiError_1 = require("./apiError");
/** POS sales require an open, unlocked cash register for the branch. */
async function assertCashRegisterOpenForSale(branchId) {
    const session = await client_1.prisma.cashFlow.findFirst({
        where: { branch_id: branchId, status: 'OPEN' },
        select: { locked: true, locked_reason: true },
    });
    if (!session) {
        throw new apiError_1.AppError(423, 'Cash register is not open. Open the cash register before creating a sale.');
    }
    if (session.locked) {
        throw new apiError_1.AppError(423, `The register is locked (${session.locked_reason || 'cashier on break'}). Unlock it from Cash Register before billing.`);
    }
}
//# sourceMappingURL=register-sale-guard.js.map