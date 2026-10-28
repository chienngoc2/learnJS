import { Request, Response } from "express";
import { transcribeAudioBuffer } from "../utils/audioTranscriber.js";

/**
 * Controller xử lý trích xuất script từ file âm thanh (MP3, WAV, M4A...)
 * Hoàn toàn miễn phí, 0 token, không dùng Groq
 */
export async function transcribeMp3Handler(req: Request, res: Response) {
  try {
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng đính kèm file âm thanh (MP3, M4A, WAV, v.v.).",
      });
    }

    // Giới hạn kích thước file 50MB
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return res.status(400).json({
        success: false,
        error: "File quá lớn. Vui lòng tải file dưới 50MB.",
      });
    }

    const originalName = file.originalname || "audio.mp3";
    const language = (req.body.language || "chinese").toLowerCase();

    console.log(`📥 [API Transcribe] Đang xử lý file: ${originalName} (${(file.size / 1024 / 1024).toFixed(2)} MB), Ngôn ngữ: ${language}`);

    const result = await transcribeAudioBuffer(file.buffer, originalName, language);

    return res.status(200).json({
      success: true,
      message: "Bóc script thành công!",
      data: {
        fileName: originalName,
        fileSize: file.size,
        duration: result.duration,
        fullText: result.fullText,
        segments: result.segments,
        totalSegments: result.segments.length,
        language: result.language,
      },
    });
  } catch (err: any) {
    console.error("❌ [API Transcribe] Lỗi khi trích xuất script:", err);
    return res.status(500).json({
      success: false,
      error: "Không thể trích xuất script từ file âm thanh: " + (err.message || "Lỗi không xác định"),
    });
  }
}
