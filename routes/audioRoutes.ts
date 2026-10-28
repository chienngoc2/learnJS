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

// Route bóc script từ file MP3 - hoàn toàn miễn phí, 0 token, không dùng Groq
router.post("/transcribe-mp3", optionalAuth, handleAudioUpload, transcribeMp3Handler);

export default router;
