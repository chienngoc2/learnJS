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

// Route xóa bài học VÀ xóa triệt để file nhị phân trong MongoDB (hỗ trợ cả xóa theo lessonId lẫn fileId)
router.delete("/lessons/:id", optionalAuth, deleteAudioLessonHandler);
router.delete("/files/:fileId", optionalAuth, deleteAudioLessonHandler);
router.delete("/:id", optionalAuth, deleteAudioLessonHandler);

// Route đọc & dịch nhanh câu / từ / đoạn văn bản như Google Translate
router.post("/translate-text", optionalAuth, async (req, res) => {
  try {
    const { text, direction = "auto" } = req.body || {};
    const cleanText = String(text || "").trim();
    if (!cleanText) {
      return res.status(400).json({ success: false, error: "Vui lòng nhập hoặc dán nội dung cần dịch." });
    }

    const { withGeminiRotation } = await import("../utils/geminiClient.js");
    const prompt = `
Bạn là hệ thống dịch thuật và phát âm tiếng Trung Phồn Thể (繁體中文 - Đài Loan/TOCFL) ⇄ Tiếng Việt chuẩn xác như Google Dịch.
Nhiệm vụ: Phân tích và dịch đoạn văn bản sau (từ đơn, câu hoặc đoạn văn):
"""
${cleanText}
"""
Chiều dịch yêu cầu: "${direction}" ("auto": tự nhận diện Trung->Việt hoặc Việt->Trung; "zh-vi": Trung->Việt; "vi-zh": Việt->Trung).

TRẢ VỀ JSON THUẦN HỢP LỆ THEO SCHEMA:
{
  "detectedLang": "zh" hoặc "vi",
  "chineseText": "Văn bản tiếng Trung Phồn Thể hoàn chỉnh",
  "pinyin": "Phiên âm Pinyin có dấu thanh điệu đầy đủ của toàn đoạn",
  "vietnameseText": "Bản dịch tiếng Việt tự nhiên, sát nghĩa",
  "sentences": [
    {
      "text": "Từng câu tiếng Trung Phồn Thể",
      "pinyin": "Pinyin của câu đó",
      "meaningVi": "Nghĩa tiếng Việt của câu đó"
    }
  ],
  "keywords": [
    {
      "term": "Từ vựng nổi bật (chữ Hán Phồn Thể)",
      "pinyin": "Pinyin",
      "meaning": "Nghĩa tiếng Việt ngắn gọn"
    }
  ]
}
Chỉ trả về JSON hợp lệ, không thêm markdown.
`;

    const aiText = await withGeminiRotation(async (client) => {
      const models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"];
      let lastErr: any;
      for (const m of models) {
        try {
          const model = client.getGenerativeModel({
            model: m,
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          });
          const out = await model.generateContent(prompt);
          const txt = out.response.text();
          if (txt) return txt;
        } catch (err: any) {
          lastErr = err;
          if (String(err?.message || "").includes("429") || String(err?.message || "").toLowerCase().includes("quota")) {
            throw err;
          }
        }
      }
      throw lastErr || new Error("Không thể kết nối AI dịch thuật.");
    });

    const cleaned = aiText.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return res.status(200).json({ success: true, data: parsed });
  } catch (err: any) {
    console.error("❌ [API TranslateText] Lỗi:", err);
    return res.status(500).json({
      success: false,
      error: "Không thể dịch đoạn văn bản: " + (err.message || "Lỗi server"),
    });
  }
});

export default router;
