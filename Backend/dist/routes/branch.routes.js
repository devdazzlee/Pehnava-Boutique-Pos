"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const branch_controller_1 = require("../controllers/branch.controller");
const branch_validation_1 = require("../validations/branch.validation");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PURCHASE_MANAGER', 'CASHIER']));
router.post('/', (0, validation_middleware_1.validate)(branch_validation_1.createBranchSchema), branch_controller_1.createBranch);
router.get('/', (0, validation_middleware_1.validate)(branch_validation_1.listBranchesSchema), branch_controller_1.listBranches);
// router.get('/:id', validate(getBranchSchema), getBranch);
router.get('/:id', (0, validation_middleware_1.validate)(branch_validation_1.getBranchSchema), branch_controller_1.getBranchDetails);
router.patch('/:id', (0, validation_middleware_1.validate)(branch_validation_1.updateBranchSchema), branch_controller_1.updateBranch);
router.patch('/:id/status', (0, validation_middleware_1.validate)(branch_validation_1.getBranchSchema), branch_controller_1.toggleBranchStatus);
router.delete('/:id', (0, validation_middleware_1.validate)(branch_validation_1.getBranchSchema), branch_controller_1.deleteBranch);
// Branch login (the User account tied to a branch) is admin-only, on top of
// the router-wide role check above.
router.get('/:id/credentials', (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']), (0, validation_middleware_1.validate)(branch_validation_1.getBranchSchema), branch_controller_1.getBranchCredentials);
router.put('/:id/credentials', (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']), (0, validation_middleware_1.validate)(branch_validation_1.branchCredentialsSchema), branch_controller_1.upsertBranchCredentials);
exports.default = router;
//# sourceMappingURL=branch.routes.js.map