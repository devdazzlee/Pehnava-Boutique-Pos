import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  closeRegisterSession,
  getRegisterReport,
  getRegisterSessionExpected,
  reopenRegisterSession,
} from '../controllers/register-report.controller';
import {
  closeRegisterSchema,
  getRegisterReportSchema,
  registerSessionIdSchema,
} from '../validations/register-report.validation';

const router = express.Router();

const viewRoles = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'];
const adminRoles = ['SUPER_ADMIN', 'ADMIN'];

router.use(authenticate);
router.get('/', authorize(viewRoles), validate(getRegisterReportSchema), getRegisterReport);
router.post('/close', authorize(viewRoles), validate(closeRegisterSchema), closeRegisterSession);
router.get('/sessions/:id/expected', authorize(viewRoles), validate(registerSessionIdSchema), getRegisterSessionExpected);
router.post('/sessions/:id/reopen', authorize(adminRoles), validate(registerSessionIdSchema), reopenRegisterSession);

export default router;
