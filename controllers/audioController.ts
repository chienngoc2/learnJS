import { Request, Response } from "express";
import { transcribeAudioBuffer } from "../utils/audioTranscriber.js";

/**
 * Controller xử lý trích xuất script từ file âm thanh (MP3, WAV, M4A...)
 * Hoàn toàn miễn phí, 0 token, không dùng Groq
 * Hỗ trợ cả Multipart FormData và Base64 Payload
 */
export async function transcribeMp3Handler(req: Request, res: Response) {
  try {
    let audioBuffer: Buffer | null = null;
    let originalName = "audio.mp3";
    let fileSize = 0;

    const file = (req as any).file;
    const files = (req as any).files;

    // 1. Kiểm tra file từ Multer (single file)
    if (file && file.buffer) {
      audioBuffer = file.buffer;
      originalName = file.originalname || "audio.mp3";
      fileSize = file.size || audioBuffer.length;
    }
    // 2. Kiểm tra files từ Multer (array)
    else if (Array.isArray(files) && files.length > 0 && files[0].buffer) {
      audioBuffer = files[0].buffer;
      originalName = files[0].originalname || "audio.mp3";
      fileSize = files[0].size || audioBuffer.length;
    }
    // 3. Hỗ trợ Base64 từ body (fileBase64 hoặc audioBase64)
    else if (req.body && (req.body.fileBase64 || req.body.audioBase64)) {
      const rawBase64 = req.body.fileBase64 || req.body.audioBase64;
      const base64Data = rawBase64.replace(/^data:audio\/[a-zA-Z0-9.-]+;base64,/, "");
      audioBuffer = Buffer.from(base64Data, "base64");
      originalName = req.body.fileName || "audio.mp3";
      fileSize = audioBuffer.length;
    }
    // 4. Hỗ trợ Data URL truyền qua trường file
    else if (req.body && typeof req.body.file === "string" && req.body.file.startsWith("data:audio")) {
      const base64Data = req.body.file.replace(/^data:audio\/[a-zA-Z0-9.-]+;base64,/, "");
      audioBuffer = Buffer.from(base64Data, "base64");
      originalName = req.body.fileName || "audio.mp3";
      fileSize = audioBuffer.length;
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng đính kèm file âm thanh (MP3, M4A, WAV, v.v.).",
      });
    }

    // Giới hạn kích thước file 50MB
    const MAX_SIZE = 50 * 1024 * 1024;
    if (fileSize > MAX_SIZE) {
      return res.status(400).json({
        success: false,
        error: "File quá lớn. Vui lòng tải file dưới 50MB.",
      });
    }

    const language = (req.body?.language || "chinese").toLowerCase();

    console.log(`📥 [API Transcribe] Đang xử lý file: ${originalName} (${(fileSize / 1024 / 1024).toFixed(2)} MB), Ngôn ngữ: ${language}`);

    const result = await transcribeAudioBuffer(audioBuffer, originalName, language);

    return res.status(200).json({
      success: true,
      message: "Bóc script thành công!",
      data: {
        fileName: originalName,
        fileSize: fileSize,
        duration: result.duration,
        fullText: result.fullText,
        fullTranslation: result.fullTranslation || "",
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
