import multer from "multer";
import fs from "fs";
import path from "path";

// 1. Lấy đường dẫn tuyệt đối đến thư mục uploads ở thư mục gốc của server
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// 2. Tự động kiểm tra và tạo thư mục nếu chưa có (Rất quan trọng khi deploy lên Render)
if (!fs.existsSync(UPLOAD_DIR)) {
  console.log("📁 Đang khởi tạo thư mục uploads...");
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Cấu hình Multer để lưu trữ file tạm thời
 * Các file này sẽ được xóa ngay sau khi gửi lên Whisper (Groq)
 * để tránh làm đầy bộ nhớ server.
 */
export const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024, // Giới hạn file tối đa 10MB (thừa đủ cho 1 đoạn hội thoại)
  },
});

