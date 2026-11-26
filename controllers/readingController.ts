import type { Request, Response } from "express";
import mongoose from "mongoose";
import ReadingPassage, { IReadingVocabItem } from "../models/ReadingPassage.js";
import VocabList from "../models/VocabList.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { ValidationError, NotFoundError } from "../utils/errors.js";
import { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { withGeminiRotation } from "../utils/geminiClient.js";
import { upsertSharedVocabBatch } from "../utils/sharedVocabService.js";

/**
 * Xây dựng bản đồ tần suất xuất hiện của từng từ vựng across tất cả VocabList & ReadingPassage khác
 */
async function buildUserVocabFrequencyMap(
  userId?: mongoose.Types.ObjectId | string | null,
  excludeReadingId?: string
): Promise<Map<string, { count: number; sources: string[] }>> {
  const ownerFilter = userId
    ? { userId }
    : { $or: [{ userId: { $exists: false } }, { userId: null }] };

  const [vocabLists, otherReadings] = await Promise.all([
    VocabList.find(ownerFilter).select("title words").lean(),
    ReadingPassage.find(ownerFilter).select("_id title vocabulary").lean(),
  ]);

  const map = new Map<string, { count: number; sources: string[] }>();

  const recordTerm = (rawTerm: string, sourceTitle: string) => {
    const t = (rawTerm || "").trim();
    if (!t) return;
    const entry = map.get(t) || { count: 0, sources: [] };
    entry.count += 1;
    if (sourceTitle && !entry.sources.includes(sourceTitle)) {
      entry.sources.push(sourceTitle);
    }
    map.set(t, entry);
  };

  for (const list of vocabLists) {
    const title = list.title || "Bài từ vựng";
    for (const w of (list.words as any[]) || []) {
      recordTerm(w?.term || w?.word || "", title);
    }
  }

  for (const r of otherReadings) {
    if (excludeReadingId && r._id.toString() === excludeReadingId) continue;
    const title = `Bài đọc: ${r.title || "Chưa đặt tên"}`;
    for (const v of (r.vocabulary as any[]) || []) {
      recordTerm(v?.term || "", title);
    }
  }

  return map;
}

function enrichVocabWithRepeats(
  vocab: Array<{ term: string; pinyin?: string; meaning?: string; pos?: string }>,
  freqMap: Map<string, { count: number; sources: string[] }>
): IReadingVocabItem[] {
  return (vocab || [])
    .filter((v) => v && v.term && String(v.term).trim())
    .map((v) => {
      const term = String(v.term).trim();
      const match = freqMap.get(term);
      return {
        term,
        pinyin: (v.pinyin || "").trim(),
        meaning: (v.meaning || "").trim(),
        pos: (v.pos || "").trim(),
        isRepeated: Boolean(match && match.count > 0),
        repeatCount: match ? match.count : 0,
        appearedIn: match ? match.sources : [],
      };
    });
}

// @desc    Lấy danh sách các bài đọc đã phân tích & lưu trong MongoDB
// @route   GET /api/reading/list
export const getReadingListHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user?._id || null;
  const filter = userId
    ? { userId }
    : { $or: [{ userId: { $exists: false } }, { userId: null }] };

  const passages = await ReadingPassage.find(filter).sort({ createdAt: -1 }).limit(50);
  res.json({ success: true, data: passages });
});

// @desc    Lấy chi tiết 1 bài đọc đã lưu từ MongoDB (0 tốn token AI)
// @route   GET /api/reading/:id
export const getReadingByIdHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id || "");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError("ID bài đọc không hợp lệ.");
  }

  const passage = await ReadingPassage.findById(id);
  if (!passage) {
    throw new NotFoundError("Không tìm thấy bài đọc.");
  }

  const authReq = req as AuthenticatedRequest;
  const freqMap = await buildUserVocabFrequencyMap(authReq.user?._id || passage.userId || null, id);
  const refreshedVocab = enrichVocabWithRepeats(passage.vocabulary as any[], freqMap);

  res.json({
    success: true,
    fromCache: true,
    data: {
      ...passage.toObject(),
      vocabulary: refreshedVocab,
    },
  });
});

// @desc    Phân tích bài đọc bằng AI (từ mới + ngữ pháp + đối chiếu từ lặp), lưu vào bảng ReadingPassage
// @route   POST /api/reading/analyze
export const analyzeReadingHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user?._id || null;

  const rawTitle = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";

  if (!content) {
    throw new ValidationError("Vui lòng dán nội dung bài đọc tiếng Trung!");
  }

  const ownerFilter = userId
    ? { userId }
    : { $or: [{ userId: { $exists: false } }, { userId: null }] };

  // 1. Nếu nội dung bài đọc đã được phân tích & lưu trước đó -> trả luôn từ MongoDB (0 token)
  const existing = await ReadingPassage.findOne({ ...ownerFilter, content });
  if (existing) {
    const freqMap = await buildUserVocabFrequencyMap(userId, existing._id.toString());
    const refreshedVocab = enrichVocabWithRepeats(existing.vocabulary as any[], freqMap);
    existing.vocabulary = refreshedVocab;
    await existing.save();

    await upsertSharedVocabBatch(
      refreshedVocab.map((v) => ({
        word: v.term,
        pinyin: v.pinyin,
        meaning: v.meaning,
        pos: v.pos,
        level: existing.title ? `Bài đọc: ${existing.title}` : "Bài đọc",
      })),
      existing.title ? `Bài đọc: ${existing.title}` : "Bài đọc"
    );

    res.status(200).json({
      success: true,
      fromCache: true,
      data: existing,
    });
    return;
  }

  // 2. Gọi Gemini AI (tự xoay vòng API key) phân tích bài đọc
  const prompt = `
Bạn là giáo viên tiếng Trung Phồn Thể (繁體中文 - TOCFL) chuyên biên soạn bài đọc hiểu.
Hãy phân tích bài đọc dưới đây:
"""
${content}
"""

YÊU CẦU TRÍCH XUẤT CHÍNH XÁC:
1. "title": Nếu bài chưa có tiêu đề rõ ràng, hãy đặt một tiêu đề ngắn gọn súc tích bằng tiếng Việt (tối đa 8 chữ).
2. "pinyin": Phiên âm Bính Âm chuẩn xác có thanh điệu cho toàn bộ bài đọc.
3. "translation": Bản dịch nghĩa tiếng Việt tự nhiên, sát văn cảnh cho toàn bài đọc.
4. "vocabulary": Liệt kê tất cả từ vựng quan trọng/từ mới trong bài (khoảng 6-25 từ, ưu tiên từ ghép và thực từ Phồn Thể, không lặp từ giống hệt nhau). Mỗi từ gồm:
   - "term": Từ vựng chữ Hán Phồn Thể (khớp đúng từ xuất hiện trong bài).
   - "pinyin": Pinyin có dấu thanh điệu.
   - "meaning": Nghĩa tiếng Việt ngắn gọn, chính xác theo ngữ cảnh bài đọc.
   - "pos": Từ loại ngắn gọn (VD: "Danh từ", "Động từ", "Tính từ", "Phó từ", "Liên từ").
5. "grammarPoints": Nếu bài đọc có các cấu trúc ngữ pháp / mẫu câu đáng chú ý (khoảng 1-6 mẫu câu; nếu không có thì trả mảng rỗng []), mỗi mục gồm:
   - "pattern": Công thức / mẫu câu (VD: "雖然……，但是……").
   - "meaning": Ý nghĩa tiếng Việt của cấu trúc.
   - "explanation": Giải thích ngắn gọn cách dùng.
   - "exampleInText": Câu ví dụ nguyên văn lấy từ trong bài đọc.
   - "exampleMeaning": Nghĩa tiếng Việt của câu ví dụ đó.

BẮT BUỘC trả về JSON thuần hợp lệ theo đúng schema trên, không kèm markdown.
`;

  const aiText = await withGeminiRotation(async (client) => {
    const models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-3.5-flash"];
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
    throw lastErr || new Error("Không thể phân tích bài đọc lúc này.");
  });

  const cleaned = aiText.replace(/```json/gi, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  // 3. Đối chiếu lặp từ across toàn bộ bài học từ vựng + các bài đọc khác của user
  const freqMap = await buildUserVocabFrequencyMap(userId);
  const enrichedVocab = enrichVocabWithRepeats(parsed.vocabulary || [], freqMap);

  const finalTitle =
    rawTitle ||
    (typeof parsed.title === "string" && parsed.title.trim()) ||
    `Bài đọc ${new Date().toLocaleDateString("vi-VN")}`;

  const grammarPoints = Array.isArray(parsed.grammarPoints)
    ? parsed.grammarPoints.map((g: any) => ({
        pattern: String(g?.pattern || "").trim(),
        meaning: String(g?.meaning || "").trim(),
        explanation: String(g?.explanation || "").trim(),
        exampleInText: String(g?.exampleInText || "").trim(),
        exampleMeaning: String(g?.exampleMeaning || "").trim(),
      })).filter((g: any) => g.pattern)
    : [];

  // 4. Lưu vào bảng ReadingPassage trên MongoDB & tự động đưa tất cả từ mới vào kho SharedVocab để tra cứu
  const saved = await ReadingPassage.create({
    userId,
    title: finalTitle,
    content,
    pinyin: String(parsed.pinyin || "").trim(),
    translation: String(parsed.translation || "").trim(),
    vocabulary: enrichedVocab,
    grammarPoints,
  });

  await upsertSharedVocabBatch(
    enrichedVocab.map((v) => ({
      word: v.term,
      pinyin: v.pinyin,
      meaning: v.meaning,
      pos: v.pos,
      level: `Bài đọc: ${finalTitle}`,
    })),
    `Bài đọc: ${finalTitle}`
  );

  res.status(201).json({
    success: true,
    fromCache: false,
    data: saved,
  });
});

// @desc    Xóa một bài đọc đã lưu khỏi MongoDB
// @route   DELETE /api/reading/:id
export const deleteReadingHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id || "");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError("ID bài đọc không hợp lệ.");
  }
  await ReadingPassage.findByIdAndDelete(id);
  res.json({ success: true, message: "Đã xóa bài đọc khỏi MongoDB." });
});
