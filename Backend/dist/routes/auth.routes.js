"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const auth_controller_1 = require("../controllers/auth.controller");
const validation_middleware_1 = require("../middleware/validation.middleware");
const auth_validation_1 = require("../validations/auth.validation");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// Open only for first-time setup (no users yet); afterwards only the owner can register accounts.
const bootstrapOrOwner = async (req, res, next) => {
    try {
        if ((await client_1.prisma.user.count()) === 0)
            return next();
        return (0, auth_middleware_1.authenticate)(req, res, (err) => {
            if (err)
                return next(err);
            if (req.user?.role !== 'SUPER_ADMIN')
                return next(new apiError_1.AppError(403, 'Only the owner can register new accounts'));
            next();
        });
    }
    catch (error) {
        next(error);
    }
};
router.post('/register', bootstrapOrOwner, (0, validation_middleware_1.validate)(auth_validation_1.registerSchema), auth_controller_1.register);
// Register endpoint for admins
router.post('/login', (0, validation_middleware_1.validate)(auth_validation_1.loginSchema), auth_controller_1.login);
router.post('/logout', auth_middleware_1.authenticate, auth_controller_1.logout);
// Self-service password change — any authenticated role (branch users included).
router.patch('/change-password', auth_middleware_1.authenticate, (0, validation_middleware_1.validate)(auth_validation_1.changePasswordSchema), auth_controller_1.changePassword);
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['SUPER_ADMIN', 'ADMIN']));
router.post('/register/admin', (0, validation_middleware_1.validate)(auth_validation_1.registerSchema), auth_controller_1.registerAdmin);
router.get('/me', auth_controller_1.getCurrentUser);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map