"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdminRole = exports.resolveBranchId = void 0;
/**
 * Resolves which branch a request should be scoped to.
 * - SUPER_ADMIN / ADMIN: can pass ?branchId= (or body.branchId) to view a single
 *   branch; omit it to see all branches (returns undefined).
 * - Everyone else: always forced to their own JWT branch_id, regardless of
 *   any branchId they try to pass, so a branch user can never read another
 *   branch's data.
 */
const resolveBranchId = (req) => {
    const jwtBranchId = req.user?.branch_id;
    const userRole = req.user?.role;
    if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
        const queryBranchId = req.query.branchId;
        const bodyBranchId = req.body?.branchId;
        if (queryBranchId && queryBranchId.trim() && queryBranchId !== 'Not Found') {
            return queryBranchId.trim();
        }
        if (bodyBranchId && bodyBranchId.trim() && bodyBranchId !== 'Not Found') {
            return bodyBranchId.trim();
        }
        return undefined;
    }
    if (jwtBranchId && jwtBranchId.trim() && jwtBranchId !== 'Not Found') {
        return jwtBranchId.trim();
    }
    return undefined;
};
exports.resolveBranchId = resolveBranchId;
const isAdminRole = (role) => role === 'SUPER_ADMIN' || role === 'ADMIN';
exports.isAdminRole = isAdminRole;
//# sourceMappingURL=resolveBranchId.js.map