import jwt from 'jsonwebtoken';
import { audit, auditFromRequest, requestMeta } from '../services/audit.service';
import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';

const authService = new AuthService();

const register = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.register(req.body);
  new ApiResponse(user, 'IUser registered successfully', 201).send(res);
});

const registerAdmin = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.registerAdmin(req.body);
  new ApiResponse(user, 'IUser registered successfully', 201).send(res);
});

const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const meta = requestMeta(req);
  try {
    const userWithToken = await authService.login(email, password);
    const decoded = jwt.decode(userWithToken.token) as { id?: string } | null;
    await audit({
      action: 'auth.login',
      category: 'security',
      summary: `Signed in (${userWithToken.user.role})`,
      userId: decoded?.id ?? null,
      userEmail: userWithToken.user.email,
      userRole: userWithToken.user.role,
      branchId: userWithToken.user.branch_id ?? null,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    new ApiResponse({ ...userWithToken }, 'Login successful').send(res);
  } catch (error) {
    await audit({
      action: 'auth.login_failed',
      category: 'security',
      summary: `Failed sign-in for ${String(email || '').slice(0, 80)}: ${(error as Error).message}`,
      userEmail: String(email || '').slice(0, 120) || null,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    throw error;
  }
});

const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout(req.user?.id!);
  await auditFromRequest(req, { action: 'auth.logout', category: 'security', summary: 'Signed out' });
  new ApiResponse(null, 'Logout successful').send(res);
});

const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  new ApiResponse(req.user, 'Current user fetched').send(res);
});

const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user!.id, currentPassword, newPassword);
  new ApiResponse(null, 'Password updated successfully').send(res);
});

export { register, login, logout, registerAdmin, getCurrentUser, changePassword };
