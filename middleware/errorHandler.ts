import { Request, Response, NextFunction } from "express";
import { AppError, ValidationError } from "../utils/errors.js";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      message: err.message,
      ...(err instanceof ValidationError && { errors: err.errors }),
    });
  }

  // Log unexpected errors
  console.error("❌ Unexpected Server Error:", err);

  const message =
    process.env.NODE_ENV === "production"
      ? "Lỗi hệ thống nội bộ sếp ơi!"
      : err.message;

  return res.status(500).json({
    success: false,
    error: message,
    message: message,
  });
};

// Async handler wrapper to automatically forward errors to errorHandler
export const asyncHandler = (
  fn: (req: Request<any, any, any, any>, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
