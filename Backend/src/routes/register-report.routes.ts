import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  closeRegisterSession,
  getRegisterReport,
  reopenRegisterSession,
} from '../controllers/register-report.controller';
import { closeRegisterSchema, getRegisterReportSchema } from '../validations/register-report.validation';

const router = express.Router();

const viewRoles = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'];
const adminRoles = ['SUPER_ADMIN', 'ADMIN'];

router.use(authenticate);
router.get('/', authorize(viewRoles), validate(getRegisterReportSchema), getRegisterReport);
router.post('/close', authorize(viewRoles), validate(closeRegisterSchema), closeRegisterSession);
router.post('/sessions/:id/reopen', authorize(adminRoles), reopenRegisterSession);

export default router;
