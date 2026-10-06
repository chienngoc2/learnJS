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
      expiresIn: (process.env.JWT_EXPIRE || "30d") as any,
    }
  );
};

// @desc    Đăng ký người dùng mới (chỉ cần email và mật khẩu)
// @route   POST /api/auth/register
// @access  Public
export const register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { email, username, password, role } = req.body;
  const rawEmail = (email || username || "").toString().trim().toLowerCase();

  if (!rawEmail || !password) {
    throw new ValidationError("Vui lòng điền đầy đủ email và mật khẩu!");
  }

  // Kiểm tra định dạng email cơ bản
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(rawEmail)) {
    throw new ValidationError("Email không hợp lệ! Vui lòng nhập đúng định dạng email (VD: name@example.com).");
  }

  if (password.length < 6) {
    throw new ValidationError("Mật khẩu phải từ 6 ký tự trở lên!");
  }

  // Kiểm tra email / tài khoản đã tồn tại chưa
  const userExists = await User.findOne({
    $or: [{ email: rawEmail }, { username: rawEmail }],
  });
  if (userExists) {
    throw new ConflictError("Email này đã được sử dụng rồi sếp ơi!");
  }

  // Đăng ký user mới (mật khẩu tự động mã hóa nhờ mongoose hook)
  const user = await User.create({
    email: rawEmail,
    username: rawEmail,
    password,
    role: role || "student",
  });

  const token = generateToken(user._id.toString(), user.role);

  res.status(201).json({
    success: true,
    message: "Đăng ký tài khoản thành công!",
    token,
    user: {
      id: user._id,
      email: user.email,
      username: user.username,
      role: user.role,
    },
  });
});

// @desc    Đăng nhập người dùng (bằng email hoặc username)
// @route   POST /api/auth/login
// @access  Public
export const login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { email, username, password } = req.body;
  const identifier = (email || username || "").toString().trim().toLowerCase();

  if (!identifier || !password) {
    throw new ValidationError("Vui lòng điền đầy đủ email và mật khẩu!");
  }

  // Tìm user theo email hoặc username
  const user = await User.findOne({
    $or: [{ email: identifier }, { username: identifier }],
  });

  if (!user) {
    throw new UnauthorizedError("Email hoặc mật khẩu không chính xác sếp ơi!");
  }

  // Kiểm tra mật khẩu
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    throw new UnauthorizedError("Email hoặc mật khẩu không chính xác sếp ơi!");
  }

  const token = generateToken(user._id.toString(), user.role);

  res.status(200).json({
    success: true,
    message: "Đăng nhập thành công!",
    token,
    user: {
      id: user._id,
      email: user.email || user.username,
      username: user.username || user.email,
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
      email: req.user.email || req.user.username,
      username: req.user.username || req.user.email,
      role: req.user.role,
      createdAt: req.user.createdAt,
    },
  });
});
