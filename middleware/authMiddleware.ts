// File: middleware/authMiddleware.ts

import type { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/User.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";
import { asyncHandler } from "./errorHandler.js";

// Định nghĩa Custom Request Interface để chứa thông tin User đã xác thực
import { Request } from "express";
export interface AuthenticatedRequest extends Request {
  user?: IUser;
}

interface DecodedToken {
  id: string;
  role: string;
  iat: number;
  exp: number;
}

// 🛡️ Middleware bảo vệ route (yêu cầu đăng nhập bằng JWT)
export const protect = asyncHandler(async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  let token: string | undefined;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    throw new UnauthorizedError("Sếp ơi, vui lòng đăng nhập để truy cập chức năng này!");
  }

  try {
    // Giải mã token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as DecodedToken;

    // Tìm user trong database
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      throw new UnauthorizedError("Tài khoản liên kết với token này không tồn tại trong hệ thống!");
    }

    // Gán user vào request object
    req.user = user;
    next();
  } catch (error) {
    console.error("Lỗi JWT verification:", error);
    throw new UnauthorizedError("Mã token không hợp lệ hoặc đã hết hạn sếp ơi!");
  }
});

// 🏷️ Middleware phân quyền (chỉ cho phép các role được chỉ định truy cập)
export const authorize = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError("Không tìm thấy thông tin đăng nhập.");
    }

    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(`Quyền truy cập của sếp là [${req.user.role}], không có quyền thực hiện hành động này!`);
    }

    next();
  };
};
