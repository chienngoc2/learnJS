import multer from "multer";
import fs from "fs";
import path from "path";

// 1. Vercel CHỈ CHO PHÉP ghi file tạm thời vào thư mục /tmp
const uploadDir = "/tmp/uploads";

// 2. Tạo thư mục một cách an toàn (tránh lỗi sập server ENOENT)
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 3. Cấu hình nơi lưu và tên file cho Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Tạo tên file độc nhất để tránh bị trùng đè lên nhau
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
    );
  },
});

// 4. Khởi tạo cục biến upload
const upload = multer({ storage: storage });

// 5. CHỐT HẠ QUAN TRỌNG: Export default để các file khác lấy được
export default upload;
