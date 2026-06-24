import multer from "multer";

// Sử dụng memoryStorage để tránh các vấn đề về ghi file tạm thời/quyền ghi trên Vercel Serverless
const storage = multer.memoryStorage();

const upload = multer({ storage: storage });

export default upload;
