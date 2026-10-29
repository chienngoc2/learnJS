import { Request, Response } from "express";
import mongoose from "mongoose";
import { transcribeAudioBuffer } from "../utils/audioTranscriber.js";
import AudioLesson from "../models/AudioLesson.js";

/**
 * Lấy đối tượng GridFSBucket để thao tác với dữ liệu nhị phân trên MongoDB
 */
function getAudioBucket(): mongoose.mongo.GridFSBucket {
  if (!mongoose.connection.db) {
    throw new Error("Cơ sở dữ liệu MongoDB chưa kết nối sẵn sàng!");
  }
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "audio_lessons",
  });
}

/**
 * Ghi Buffer nhị phân của file MP3 trực tiếp vào MongoDB GridFS
 */
async function saveBufferToGridFS(
  buffer: Buffer,
  filename: string,
  contentType: string = "audio/mpeg",
  metadata: Record<string, any> = {}
): Promise<mongoose.Types.ObjectId> {
  const bucket = getAudioBucket();
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      contentType,
      metadata,
    });

    uploadStream.on("error", (err) => reject(err));
    uploadStream.on("finish", () => {
      resolve(uploadStream.id as mongoose.Types.ObjectId);
    });

    uploadStream.end(buffer);
  });
}

/**
 * Controller xử lý trích xuất script từ file âm thanh (MP3, WAV, M4A...)
 * Tự động ghi mã nhị phân vào MongoDB GridFS để lưu trữ vĩnh viễn
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
    // 3. Hỗ trợ Base64 từ body
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

    const MAX_SIZE = 50 * 1024 * 1024;
    if (fileSize > MAX_SIZE) {
      return res.status(400).json({
        success: false,
        error: "File quá lớn. Vui lòng tải file dưới 50MB.",
      });
    }

    const language = (req.body?.language || "chinese").toLowerCase();

    console.log(`📥 [API Transcribe] Đang xử lý file: ${originalName} (${(fileSize / 1024 / 1024).toFixed(2)} MB), Ngôn ngữ: ${language}`);

    // Bóc script 100% bằng Gemini AI
    const result = await transcribeAudioBuffer(audioBuffer, originalName, language);

    // Lưu mã nhị phân trực tiếp vào MongoDB GridFS
    let gridFsFileId: mongoose.Types.ObjectId | null = null;
    let savedLessonId: string | null = null;

    try {
      const userId = (req as any).user?._id || null;
      gridFsFileId = await saveBufferToGridFS(audioBuffer, originalName, "audio/mpeg", {
        userId,
        fileSize,
        duration: result.duration,
      });

      const now = new Date();
      const formattedDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes() < 10 ? "0" + now.getMinutes() : now.getMinutes()}`;
      const lessonTitle = originalName.replace(/\.[^/.]+$/, "") || "Bài nghe tiếng Trung";

      const newLesson = await AudioLesson.create({
        userId,
        gridFsFileId,
        title: lessonTitle,
        originalFileName: originalName,
        fileSize: fileSize,
        duration: result.duration,
        fullText: result.fullText,
        fullTranslation: result.fullTranslation || "",
        segments: result.segments,
        totalSegments: result.segments.length,
        language: result.language,
        savedAtFormatted: formattedDate,
      });

      savedLessonId = newLesson._id.toString();
      console.log(`💾 [MongoDB GridFS] Đã lưu nhị phân file "${originalName}" (GridFS ID: ${gridFsFileId}) và AudioLesson: ${savedLessonId}`);
    } catch (saveErr: any) {
      console.warn("⚠️ [MongoDB GridFS] Không thể lưu nhị phân tự động vào MongoDB:", saveErr.message);
    }

    const fileIdStr = gridFsFileId ? gridFsFileId.toString() : "";

    return res.status(200).json({
      success: true,
      message: "Bóc script và lưu nhị phân vào MongoDB thành công!",
      data: {
        lessonId: savedLessonId,
        fileId: fileIdStr,
        fileName: originalName,
        fileSize: fileSize,
        duration: result.duration,
        fullText: result.fullText,
        fullTranslation: result.fullTranslation || "",
        segments: result.segments,
        totalSegments: result.segments.length,
        language: result.language,
        streamUrl: fileIdStr ? `/api/audio/files/${fileIdStr}` : "",
        downloadUrl: fileIdStr ? `/api/audio/download/${fileIdStr}` : "",
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

/**
 * Lấy danh sách các bài học & file ghi âm đã lưu từ MongoDB
 * Đồng bộ xuyên suốt giữa các thiết bị của người dùng
 */
export async function getSavedLessonsHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?._id;
    const filter = userId ? { $or: [{ userId }, { userId: null }] } : {};

    const lessons = await AudioLesson.find(filter).sort({ createdAt: -1 }).limit(100);

    const formatted = lessons.map((l) => {
      const fileIdStr = l.gridFsFileId ? l.gridFsFileId.toString() : "";
      return {
        id: l._id.toString(),
        lessonId: l._id.toString(),
        title: l.title,
        originalFileName: l.originalFileName,
        duration: l.duration,
        fileSize: l.fileSize,
        fileUri: fileIdStr ? `/api/audio/files/${fileIdStr}` : "",
        streamUrl: fileIdStr ? `/api/audio/files/${fileIdStr}` : "",
        downloadUrl: fileIdStr ? `/api/audio/download/${fileIdStr}` : "",
        gridFsFileId: fileIdStr,
        fullText: l.fullText,
        fullTranslation: l.fullTranslation,
        segments: l.segments,
        totalSegments: l.totalSegments || l.segments.length,
        language: l.language,
        savedAt: l.savedAtFormatted || (l.createdAt ? new Date(l.createdAt).toLocaleDateString("vi-VN") : ""),
      };
    });

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (err: any) {
    console.error("❌ [API GetSavedLessons] Lỗi lấy danh sách bài nghe:", err);
    return res.status(500).json({
      success: false,
      error: "Không thể tải danh sách bài nghe từ MongoDB: " + (err.message || ""),
    });
  }
}

/**
 * Lưu hoặc cập nhật thủ công một bài học âm thanh vào MongoDB
 */
export async function saveAudioLessonHandler(req: Request, res: Response) {
  try {
    const {
      lessonId,
      title,
      fullText,
      fullTranslation,
      segments,
      duration,
      fileSize,
      gridFsFileId,
    } = req.body;

    const userId = (req as any).user?._id || null;
    const now = new Date();
    const formattedDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes() < 10 ? "0" + now.getMinutes() : now.getMinutes()}`;

    // Cập nhật nếu bài học đã tồn tại
    if (lessonId && mongoose.Types.ObjectId.isValid(lessonId)) {
      const updated = await AudioLesson.findByIdAndUpdate(
        lessonId,
        {
          title: title || undefined,
          fullText: fullText || undefined,
          fullTranslation: fullTranslation || undefined,
          segments: segments || undefined,
          duration: duration || undefined,
          totalSegments: segments ? segments.length : undefined,
          savedAtFormatted: formattedDate,
        },
        { new: true }
      );
      if (updated) {
        return res.status(200).json({
          success: true,
          message: "Đã cập nhật bài học thành công!",
          data: updated,
        });
      }
    }

    // Tạo mới nếu chưa có
    if (!gridFsFileId || !mongoose.Types.ObjectId.isValid(gridFsFileId)) {
      return res.status(400).json({
        success: false,
        error: "Thiếu mã file nhị phân gridFsFileId hợp lệ.",
      });
    }

    const created = await AudioLesson.create({
      userId,
      gridFsFileId: new mongoose.Types.ObjectId(gridFsFileId),
      title: title || "Bài nghe tiếng Trung",
      originalFileName: title || "audio.mp3",
      duration: duration || 0,
      fileSize: fileSize || 0,
      fullText: fullText || "",
      fullTranslation: fullTranslation || "",
      segments: segments || [],
      totalSegments: segments ? segments.length : 0,
      savedAtFormatted: formattedDate,
    });

    return res.status(201).json({
      success: true,
      message: "Đã lưu bài học vào MongoDB thành công!",
      data: created,
    });
  } catch (err: any) {
    console.error("❌ [API SaveLesson] Lỗi lưu bài học:", err);
    return res.status(500).json({
      success: false,
      error: "Không thể lưu bài học vào MongoDB: " + (err.message || ""),
    });
  }
}

/**
 * Stream file âm thanh nhị phân trực tiếp từ MongoDB GridFS
 * Hỗ trợ chuẩn HTTP Range 206 để tua đoạn câu audio cực mượt
 */
export async function streamAudioFileHandler(req: Request, res: Response) {
  try {
    const rawFileId = req.params.fileId;
    const fileId = Array.isArray(rawFileId) ? rawFileId[0] : String(rawFileId || "");
    if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({ success: false, error: "ID file không hợp lệ." });
    }

    const bucket = getAudioBucket();
    const objId = new mongoose.Types.ObjectId(fileId);
    const files = await bucket.find({ _id: objId }).toArray();

    if (!files || files.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy file âm thanh nhị phân trong MongoDB.",
      });
    }

    const fileInfo = files[0];
    const totalSize = fileInfo.length;
    const contentType = fileInfo.contentType || "audio/mpeg";

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize) {
        res.setHeader("Content-Range", `bytes */${totalSize}`);
        return res.status(416).end();
      }

      const chunksize = end - start + 1;

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000",
      });

      const downloadStream = bucket.openDownloadStream(objId, {
        start,
        end: end + 1,
      });

      downloadStream.on("error", () => {
        if (!res.headersSent) res.status(500).end();
      });

      req.on("close", () => {
        try {
          downloadStream.destroy();
        } catch (e) {}
      });

      downloadStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": totalSize,
        "Accept-Ranges": "bytes",
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000",
      });

      const downloadStream = bucket.openDownloadStream(objId);
      downloadStream.on("error", () => {
        if (!res.headersSent) res.status(500).end();
      });

      req.on("close", () => {
        try {
          downloadStream.destroy();
        } catch (e) {}
      });

      downloadStream.pipe(res);
    }
  } catch (err: any) {
    console.error("❌ [API StreamAudio] Lỗi stream file âm thanh:", err);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: "Lỗi phát file âm thanh từ MongoDB: " + (err.message || ""),
      });
    }
  }
}

/**
 * Tải file MP3 nhị phân từ MongoDB về máy tính/điện thoại
 */
export async function downloadAudioFileHandler(req: Request, res: Response) {
  try {
    const rawFileId = req.params.fileId;
    const fileId = Array.isArray(rawFileId) ? rawFileId[0] : String(rawFileId || "");
    if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({ success: false, error: "ID file không hợp lệ." });
    }

    const bucket = getAudioBucket();
    const objId = new mongoose.Types.ObjectId(fileId);
    const files = await bucket.find({ _id: objId }).toArray();

    if (!files || files.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy file âm thanh nhị phân trong MongoDB.",
      });
    }

    const fileInfo = files[0];
    const totalSize = fileInfo.length;
    const filename = fileInfo.filename || "audio.mp3";
    const contentType = fileInfo.contentType || "audio/mpeg";

    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", totalSize);

    const downloadStream = bucket.openDownloadStream(objId);
    downloadStream.on("error", () => {
      if (!res.headersSent) res.status(500).end();
    });

    downloadStream.pipe(res);
  } catch (err: any) {
    console.error("❌ [API DownloadAudio] Lỗi tải file:", err);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: "Lỗi tải file âm thanh: " + (err.message || ""),
      });
    }
  }
}

/**
 * Xóa vĩnh viễn bài nghe VÀ file âm thanh nhị phân khỏi MongoDB
 * Đáp ứng yêu cầu: Khi bấm xóa bên cạnh bài nghe thì xóa cả trên MongoDB
 */
export async function deleteAudioLessonHandler(req: Request, res: Response) {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : String(rawId || "");
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: "Mã bài học ID không hợp lệ." });
    }

    const bucket = getAudioBucket();
    let gridFsIdToDelete: mongoose.Types.ObjectId | null = null;
    let deletedTitle = "";

    // 1. Tìm và xóa trong collection AudioLesson
    const lesson = await AudioLesson.findById(id);
    if (lesson) {
      gridFsIdToDelete = lesson.gridFsFileId;
      deletedTitle = lesson.title;
      await AudioLesson.findByIdAndDelete(id);
      console.log(`🗑️ Đã xóa AudioLesson "${deletedTitle}" (ID: ${id})`);
    } else {
      // Trường hợp id truyền vào chính là gridFsFileId
      const lessonByGridFs = await AudioLesson.findOne({ gridFsFileId: new mongoose.Types.ObjectId(id) });
      if (lessonByGridFs) {
        gridFsIdToDelete = lessonByGridFs.gridFsFileId;
        deletedTitle = lessonByGridFs.title;
        await AudioLesson.findByIdAndDelete(lessonByGridFs._id);
        console.log(`🗑️ Đã xóa AudioLesson qua GridFs ID "${deletedTitle}" (ID: ${lessonByGridFs._id})`);
      } else {
        gridFsIdToDelete = new mongoose.Types.ObjectId(id);
      }
    }

    // 2. Xóa triệt để các chunks nhị phân trong MongoDB GridFS
    if (gridFsIdToDelete) {
      try {
        await bucket.delete(gridFsIdToDelete);
        console.log(`🗑️ Đã xóa vĩnh viễn chunks nhị phân GridFS: ${gridFsIdToDelete}`);
      } catch (gridErr: any) {
        console.warn(`⚠️ File GridFS ${gridFsIdToDelete} có thể đã được dọn trước đó:`, gridErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Đã xóa vĩnh viễn bài nghe "${deletedTitle || "âm thanh"}" và file nhị phân khỏi MongoDB!`,
    });
  } catch (err: any) {
    console.error("❌ [API DeleteLesson] Lỗi xóa bài nghe:", err);
    return res.status(500).json({
      success: false,
      error: "Không thể xóa bài nghe khỏi MongoDB: " + (err.message || ""),
    });
  }
}
