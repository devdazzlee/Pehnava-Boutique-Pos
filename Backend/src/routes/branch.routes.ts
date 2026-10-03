import express from 'express';
import {
    createBranch,
    // getBranch,
    updateBranch,
    toggleBranchStatus,
    listBranches,
    getBranchDetails,
    deleteBranch,
    getBranchCredentials,
    upsertBranchCredentials,
} from '../controllers/branch.controller';
import {
    createBranchSchema,
    updateBranchSchema,
    getBranchSchema,
    listBranchesSchema,
    branchCredentialsSchema,
} from '../validations/branch.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PURCHASE_MANAGER', 'CASHIER']));

router.post('/', validate(createBranchSchema), createBranch);
router.get('/', validate(listBranchesSchema), listBranches);
// router.get('/:id', validate(getBranchSchema), getBranch);
router.get('/:id', validate(getBranchSchema), getBranchDetails);
router.patch('/:id', validate(updateBranchSchema), updateBranch);
router.patch('/:id/status', validate(getBranchSchema), toggleBranchStatus);
router.delete('/:id', validate(getBranchSchema), deleteBranch);

// Branch login (the User account tied to a branch) is admin-only, on top of
// the router-wide role check above.
router.get(
    '/:id/credentials',
    authorize(['SUPER_ADMIN', 'ADMIN']),
    validate(getBranchSchema),
    getBranchCredentials,
);
router.put(
    '/:id/credentials',
    authorize(['SUPER_ADMIN', 'ADMIN']),
    validate(branchCredentialsSchema),
    upsertBranchCredentials,
);

export default router;