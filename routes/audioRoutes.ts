import express from "express";
import multer from "multer";
import {
  transcribeMp3Handler,
  getSavedLessonsHandler,
  saveAudioLessonHandler,
  streamAudioFileHandler,
  downloadAudioFileHandler,
  deleteAudioLessonHandler,
} from "../controllers/audioController.js";
import { optionalAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // Hỗ trợ file MP3 lên đến 50MB
});

// Hỗ trợ nhận file từ bất kỳ trường nào (file, audio, mp3...)
const handleAudioUpload = (req: any, res: any, next: any) => {
  audioUpload.any()(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error: `Lỗi tải file lên: ${err.message}`,
      });
    }
    if (req.files && req.files.length > 0) {
      req.file = req.files[0];
    }
    next();
  });
};

// Route kiểm tra endpoint (dành cho trình duyệt hoặc healthcheck GET)
router.get("/transcribe-mp3", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Endpoint bóc Script MP3 & Lưu trữ Nhị phân MongoDB đang hoạt động bình thường!",
    method: "POST",
    supportedFormats: ["mp3", "m4a", "wav", "aac", "ogg", "flac"],
    maxFileSize: "50MB",
  });
});

// Route bóc script từ file MP3 & tự động lưu nhị phân vào MongoDB GridFS
router.post("/transcribe-mp3", optionalAuth, handleAudioUpload, transcribeMp3Handler);

// Route lấy toàn bộ danh sách bài học và file ghi âm đã lưu từ MongoDB
router.get("/lessons", optionalAuth, getSavedLessonsHandler);

// Route lưu hoặc cập nhật bài học vào MongoDB
router.post("/save-lesson", optionalAuth, saveAudioLessonHandler);

// Route stream dữ liệu nhị phân trực tiếp từ MongoDB GridFS (hỗ trợ HTTP Range để tua mượt)
router.get("/files/:fileId", streamAudioFileHandler);

// Route tải file MP3 nhị phân từ MongoDB về máy tính / điện thoại
router.get("/download/:fileId", downloadAudioFileHandler);

// Route xóa bài học VÀ xóa triệt để file nhị phân trong MongoDB
router.delete("/lessons/:id", optionalAuth, deleteAudioLessonHandler);

export default router;
