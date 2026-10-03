import express, { NextFunction, Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { getCurrentUser, login, logout, register, registerAdmin, changePassword } from '../controllers/auth.controller';
import { validate } from '../middleware/validation.middleware';
import { loginSchema, registerSchema, changePasswordSchema } from '../validations/auth.validation';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// Open only for first-time setup (no users yet); afterwards only the owner can register accounts.
const bootstrapOrOwner = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if ((await prisma.user.count()) === 0) return next();
    return authenticate(req, res, (err?: unknown) => {
      if (err) return next(err);
      if (req.user?.role !== 'SUPER_ADMIN') return next(new AppError(403, 'Only the owner can register new accounts'));
      next();
    });
  } catch (error) {
    next(error);
  }
};

router.post('/register', bootstrapOrOwner, validate(registerSchema), register);
// Register endpoint for admins
router.post('/login', validate(loginSchema), login);
router.post('/logout', authenticate, logout);
// Self-service password change — any authenticated role (branch users included).
router.patch('/change-password', authenticate, validate(changePasswordSchema), changePassword);

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));
router.post('/register/admin', validate(registerSchema), registerAdmin);
router.get('/me', getCurrentUser);

export default router;
