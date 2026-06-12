// File: controllers/authController.ts

import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { ValidationError, UnauthorizedError, ConflictError } from "../utils/errors.js";
import { AuthenticatedRequest } from "../middleware/authMiddleware.js";

// Helper sinh JWT Token
const generateToken = (id: string, role: string): string => {
  return jwt.sign(
    { id, role },
    (process.env.JWT_SECRET || "sensei_ai_secret_key_super_secure") as string,
    {
      expiresIn: (process.env.JWT_EXPIRE || "30d") as string,
    }
  );
};

// @desc    Đăng ký người dùng mới
// @route   POST /api/auth/register
// @access  Public
export const register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { username, password, role } = req.body;

  if (!username || !password) {
    throw new ValidationError("Vui lòng điền đầy đủ tài khoản và mật khẩu!");
  }

  // Kiểm tra tài khoản đã tồn tại chưa
  const userExists = await User.findOne({ username: username.toLowerCase() });
  if (userExists) {
    throw new ConflictError("Tên tài khoản này đã được sử dụng sếp ơi!");
  }

  // Đăng ký user mới (mật khẩu tự động mã hóa nhờ mongoose hook)
  const user = await User.create({
    username: username.toLowerCase(),
    password,
    role: role || "student", // Mặc định là học viên nếu không truyền
  });

  const token = generateToken(user._id.toString(), user.role);

  res.status(201).json({
    success: true,
    message: "Đăng ký tài khoản thành công!",
    token,
    user: {
      id: user._id,
      username: user.username,
      role: user.role,
    },
  });
});

// @desc    Đăng nhập người dùng
// @route   POST /api/auth/login
// @access  Public
export const login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  if (!username || !password) {
    throw new ValidationError("Vui lòng điền đầy đủ tài khoản và mật khẩu!");
  }

  // Tìm user theo username
  const user = await User.findOne({ username: username.toLowerCase() });
  if (!user) {
    throw new UnauthorizedError("Tài khoản hoặc mật khẩu không chính xác sếp ơi!");
  }

  // Kiểm tra mật khẩu
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    throw new UnauthorizedError("Tài khoản hoặc mật khẩu không chính xác sếp ơi!");
  }

  const token = generateToken(user._id.toString(), user.role);

  res.status(200).json({
    success: true,
    message: "Đăng nhập thành công!",
    token,
    user: {
      id: user._id,
      username: user.username,
      role: user.role,
    },
  });
});

// @desc    Lấy thông tin tài khoản hiện tại
// @route   GET /api/auth/me
// @access  Private
export const getMe = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthorizedError("Sếp chưa đăng nhập!");
  }

  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      username: req.user.username,
      role: req.user.role,
      createdAt: req.user.createdAt,
    },
  });
});
