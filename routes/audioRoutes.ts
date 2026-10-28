import express from "express";
import multer from "multer";
import { transcribeMp3Handler } from "../controllers/audioController.js";
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
    message: "Endpoint bóc Script MP3 đang hoạt động bình thường! Vui lòng gửi yêu cầu POST kèm file âm thanh qua FormData (trường: 'file' hoặc 'audio').",
    method: "POST",
    supportedFormats: ["mp3", "m4a", "wav", "aac", "ogg", "flac"],
    maxFileSize: "50MB",
  });
});

// Route bóc script từ file MP3 - hoàn toàn miễn phí, 0 token, không dùng Groq
router.post("/transcribe-mp3", optionalAuth, handleAudioUpload, transcribeMp3Handler);

export default router;
