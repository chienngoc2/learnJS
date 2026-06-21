// File: controllers/vocabController.ts

import type { Request, Response } from "express";
import mongoose from "mongoose";
import VocabList from "../models/VocabList.js";
import StudyLog from "../models/StudyLog.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { NotFoundError, ValidationError, UnauthorizedError } from "../utils/errors.js";
import { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { syncVocabListToPinecone, deleteVocabListFromPinecone } from "../utils/ragSync.js";

// =========================================================================
// 📦 1. ĐỊNH NGHĨA CÁC INTERFACES (Gom lên đầu trang, chuẩn hóa examples[])
// =========================================================================
interface WordItem {
  term: string;
  def: string;
  _id?: string;
}

interface VocabRequestBody {
  title: string;
  list: WordItem[];
}

interface GrammarPointItem {
  title: string;
  formula: string;
  meaning: string;
  examples: string[]; // 🚀 ĐÃ ĐỒNG BỘ: Chuyển sang mảng chuỗi để chứa nhiều ví dụ mẫu
  topicName?: string;
}

interface AddGrammarReqBody {
  topicName: string;
  grammarPoints: GrammarPointItem[];
}

// =========================================================================
// 🍃 2. CÁC HÀM XỬ LÝ TỪ VỰNG (VOCABULARY CONTROLLERS)
// =========================================================================

// @desc    Lấy tất cả danh sách bài học
// @route   GET /api/vocab/lists
export const getAllLists = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const lists = await VocabList.find()
    .select("title createdAt words")
    .sort({ createdAt: -1 });
  res.json({ success: true, data: lists });
});

// @desc    Lấy chi tiết 1 bài học theo ID (Tự động ghi nhận log xem bài)
// @route   GET /api/vocab/list/:id
export const getListById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const list = await VocabList.findById(req.params.id);
  if (!list) {
    throw new NotFoundError("Không tìm thấy bài học");
  }

  // Tự động ghi nhận log học tập nếu có user đăng nhập
  if (authReq.user) {
    try {
      await StudyLog.create({
        userId: authReq.user._id,
        vocabListId: list._id,
        action: "view"
      });
      console.log(`🌲 [StudyLog] Đã tự động ghi nhận user [${authReq.user.username}] xem bài [${list.title}]`);
    } catch (logError: any) {
      console.error("⚠️ Lỗi tự động ghi log học tập:", logError.message);
    }
  }

  res.json({ success: true, data: list });
});

// @desc    Ghi nhận log xem bài học thủ công từ Frontend
// @route   POST /api/vocab/log-view
export const logView = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    throw new UnauthorizedError("Sếp chưa đăng nhập!");
  }

  const { vocabListId } = req.body;
  if (!vocabListId) {
    throw new ValidationError("Thiếu thông tin ID bài học!");
  }

  if (!mongoose.Types.ObjectId.isValid(vocabListId)) {
    throw new ValidationError("ID bài học không hợp lệ!");
  }

  const targetList = await VocabList.findById(vocabListId);
  if (!targetList) {
    throw new NotFoundError("Không tìm thấy bài học tương ứng!");
  }

  const log = await StudyLog.create({
    userId: authReq.user._id,
    vocabListId: new mongoose.Types.ObjectId(vocabListId),
    action: "view",
  });

  console.log(`🌲 [StudyLog] Đã ghi nhận log thủ công user [${authReq.user.username}] xem bài [${targetList.title}]`);

  res.status(201).json({
    success: true,
    data: log,
  });
});

// Helper để chuẩn hóa danh sách từ vựng đầu vào (tương thích cả {term, def} và {word, meaning...})
const normalizeWordsList = (list: any[]): any[] => {
  if (!list || !Array.isArray(list)) return [];
  return list.map((item: any) => {
    // Nếu đã đúng định dạng {term, def} của DB
    if (item.term !== undefined && item.def !== undefined) {
      let extra: any = {};
      try {
        const trimmed = String(item.def).trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          extra = JSON.parse(trimmed);
        }
      } catch (e) {}

      return {
        term: String(item.term),
        def: typeof item.def === "object" ? JSON.stringify(item.def) : String(item.def),
        correctCount: item.correctCount !== undefined ? Number(item.correctCount) : 0,
        reading: item.reading || extra.reading,
        meaning: item.meaning || extra.meaning,
        type: item.type || extra.type,
        jlpt: item.jlpt || extra.jlpt,
        examples: item.examples || extra.examples,
        audio: item.audio || extra.audio,
        tags: item.tags || extra.tags,
        notes: item.notes || extra.notes
      };
    }
    // Định dạng WordDetails từ frontend web/mobile mới
    if (item.word !== undefined) {
      const defObj = {
        reading: item.reading || item.word || "",
        meaning: item.meaning || "",
        type: item.type || "noun",
        jlpt: item.jlpt || "N5",
        examples: item.examples || [],
        audio: item.audio || "",
        tags: item.tags || [],
        notes: item.notes || ""
      };
      return {
        term: String(item.word),
        def: JSON.stringify(defObj),
        correctCount: item.correctCount !== undefined ? Number(item.correctCount) : 0,
        reading: defObj.reading,
        meaning: defObj.meaning,
        type: defObj.type,
        jlpt: defObj.jlpt,
        examples: defObj.examples,
        audio: defObj.audio,
        tags: defObj.tags,
        notes: defObj.notes
      };
    }
    return null;
  }).filter((w: any) => w !== null && w.term);
};

// @desc    Lưu bài học mới
// @route   POST /api/vocab/save
export const createList = asyncHandler(async (
  req: Request<{}, {}, VocabRequestBody>, 
  res: Response
): Promise<void> => {
  const { title, list } = req.body;

  if (!title || !list || !Array.isArray(list)) {
    throw new ValidationError("Thiếu tiêu đề hoặc danh sách từ vựng!");
  }

  const normalizedWords = normalizeWordsList(list);

  console.log(`📦 [VocabSave] Lưu bộ "${title}" với ${normalizedWords.length} từ vựng (raw: ${list.length} items)`);

  const newList = new VocabList({
    title: title,
    words: normalizedWords,
  });
  await newList.save();
  
  // Tự động đồng bộ Pinecone (chạy ngầm)
  syncVocabListToPinecone(newList._id.toString());

  res.json({ success: true, data: newList });
});

// @desc    Lưu hoặc cập nhật bài "Cần ôn tập"
// @route   POST /api/vocab/save-review
export const saveReviewList = asyncHandler(async (
  req: Request<{}, {}, VocabRequestBody>, 
  res: Response
): Promise<void> => {
  const { title, list } = req.body;
  let existing = await VocabList.findOne({ title: title });
  let targetId = "";

  const normalized = normalizeWordsList(list);

  if (existing) {
    const oldWords = (existing.words as any[]).map((w) => w.term);
    const newUniqueWords = normalized.filter((w) => !oldWords.includes(w.term));
    
    (existing.words as any[]).push(...newUniqueWords);
    await existing.save();
    targetId = existing._id.toString();
  } else {
    const newList = new VocabList({ title, words: normalized });
    await newList.save();
    targetId = newList._id.toString();
  }

  // Tự động đồng bộ Pinecone
  syncVocabListToPinecone(targetId);

  res.json({ success: true });
});

// @desc    Cập nhật bài học hiện có (Từ vựng)
// @route   PUT /api/vocab/update/:id
export const updateList = asyncHandler(async (
  req: Request<{ id: string }, {}, VocabRequestBody>, 
  res: Response
): Promise<void> => {
  const { title, list } = req.body;
  const normalized = normalizeWordsList(list);
  const updatedList = await VocabList.findByIdAndUpdate(
    req.params.id,
    { title: title, words: normalized },
    { new: true }
  );

  if (updatedList) {
    // Tự động cập nhật Pinecone
    syncVocabListToPinecone(updatedList._id.toString());
  }

  res.json({ success: true, data: updatedList });
});

// @desc    Xóa bài học theo ID
// @route   DELETE /api/vocab/delete/:id
export const deleteList = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const deleted = await VocabList.findByIdAndDelete(req.params.id);
  if (!deleted) {
    throw new NotFoundError("Không tìm thấy bài học để xóa");
  }

  // Tự động xóa trên Pinecone
  deleteVocabListFromPinecone(req.params.id);

  res.json({ success: true, message: "Đã xóa bài học thành công" });
});

// =========================================================================
// 🔥 3. CÁC HÀM XỬ LÝ NGỮ PHÁP TỐI ƯU HÓA (GRAMMAR CONTROLLERS)
// =========================================================================

// @desc    Thêm mới hoặc tạo mới bài học chứa ngữ pháp
// @route   POST /api/vocab/add-grammar-upsert
export const addOrUpdateGrammar = asyncHandler(async (
  req: Request<{}, {}, AddGrammarReqBody>, 
  res: Response
): Promise<void> => {
  const { topicName, grammarPoints } = req.body;

  if (!topicName || !grammarPoints || grammarPoints.length === 0) {
    throw new ValidationError("Thiếu dữ liệu sếp ơi!");
  }

  const cleanTopicName = topicName.trim();

  // Chuẩn hóa grammarPoints để đảm bảo examples luôn là mảng chuỗi và topicName được điền đầy đủ
  const normalizedGrammarPoints = grammarPoints.map((gp: any) => ({
    title: gp.title,
    formula: gp.formula || "",
    meaning: gp.meaning,
    examples: Array.isArray(gp.examples)
      ? gp.examples.map((ex: any) => {
          if (typeof ex === "string") return ex;
          if (ex && typeof ex === "object") {
            return `${ex.jp || ""} : ${ex.vn || ""}`;
          }
          return String(ex);
        })
      : [],
    topicName: gp.topicName || cleanTopicName
  }));

  // 1. Tìm xem bài học đã tồn tại chưa
  const existingList = await VocabList.findOne({ title: cleanTopicName });

  if (existingList) {
    // TRƯỜNG HỢP 1: Tồn tại -> Chỉ cần Push thêm vào mảng cũ
    await VocabList.updateOne(
      { _id: existingList._id },
      { $push: { grammarPoints: { $each: normalizedGrammarPoints } } }
    );
    
    // Tự động đồng bộ Pinecone
    syncVocabListToPinecone(existingList._id.toString());

    res.status(200).json({ 
      success: true, 
      message: "Đã thêm ngữ pháp vào bài học hiện có!" 
    });
  } else {
    // TRƯỜNG HỢP 2: Chưa tồn tại -> Tạo mới hoàn toàn
    const newList = new VocabList({
      title: cleanTopicName,
      grammarPoints: normalizedGrammarPoints,
      words: [] // Khởi tạo mảng trống để không vi phạm Schema (nếu có yêu cầu)
    });
    
    await newList.save();
    
    // Tự động đồng bộ Pinecone
    syncVocabListToPinecone(newList._id.toString());

    res.status(200).json({ 
      success: true, 
      message: "Đã tạo mới bài học và lưu ngữ pháp thành công!" 
    });
  }
});

// @desc    Cập nhật 1 cấu trúc ngữ pháp cụ thể bằng cách định vị cặp ID truyền vào
// @route   PUT /api/vocab/update-grammar/:topicId/:grammarId
export const updateSingleGrammar = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const topicId = req.params.topicId as string;
  const grammarId = req.params.grammarId as string;
  const { title, formula, meaning, examples, topicName } = req.body;

  //  CHẮN LỖI PARAMS: Ép kiểm tra xem 2 ID nhảy từ route sang có chuẩn cấu trúc Mongo hay không
  if (!mongoose.Types.ObjectId.isValid(topicId) || !mongoose.Types.ObjectId.isValid(grammarId)) {
    throw new ValidationError(`ID bài học hoặc ID ngữ pháp sai định dạng ObjectId sếp ơi! Nhận được: topicId=${topicId}, grammarId=${grammarId}`);
  }

  // Chuẩn hóa examples sang mảng chuỗi
  const normalizedExamples = Array.isArray(examples)
    ? examples.map((ex: any) => {
        if (typeof ex === "string") return ex;
        if (ex && typeof ex === "object") {
          return `${ex.jp || ""} : ${ex.vn || ""}`;
        }
        return String(ex);
      })
    : [];

  // Định vị chuẩn xác bài học lớn và vị trí index của object con trong mảng bằng toán tử "$"
  const result = await VocabList.findOneAndUpdate(
    { 
      _id: topicId, 
      "grammarPoints._id": grammarId 
    },
    {
      $set: {
        "grammarPoints.$.title": title,
        "grammarPoints.$.formula": formula,
        "grammarPoints.$.meaning": meaning,
        "grammarPoints.$.examples": normalizedExamples, // 🚀 ĐÃ FIX LOGIC MỚI: Lưu mảng chuỗi examples đồng bộ với FE
        "grammarPoints.$.topicName": topicName
      }
    },
    { new: true }
  );

  if (!result) {
    throw new NotFoundError("Không tìm thấy bài học hoặc cấu trúc ngữ pháp này để chỉnh sửa sếp ơi!");
  }

  // Tự động cập nhật Pinecone
  syncVocabListToPinecone(topicId);

  res.status(200).json({ 
    success: true, 
    message: "Cập nhật cấu trúc ngữ pháp và danh sách ví dụ thành công!", 
    data: result 
  });
});

// @desc    Xóa 1 cấu trúc ngữ pháp cụ thể ra khỏi mảng danh mục
// @route   DELETE /api/vocab/delete-grammar/:topicId/:grammarId
export const deleteSingleGrammar = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const topicId = req.params.topicId as string;
  const grammarId = req.params.grammarId as string;

  if (!mongoose.Types.ObjectId.isValid(topicId) || !mongoose.Types.ObjectId.isValid(grammarId)) {
    throw new ValidationError("ID truyền lên không đúng cấu trúc ObjectId hệ thống.");
  }

  const result = await VocabList.findByIdAndUpdate(
    topicId,
    { 
      $pull: { grammarPoints: { _id: grammarId } } 
    },
    { new: true } 
  );

  if (!result) {
    throw new NotFoundError("Không tìm thấy bài học để tiến hành xóa xương cấu trúc này sếp ơi!");
  }

  // Tự động cập nhật Pinecone
  syncVocabListToPinecone(topicId);

  res.status(200).json({ 
    success: true, 
    message: "Đã xóa cấu trúc ngữ pháp này thành công!", 
    data: result 
  });
});

// @desc    Bốc tổng kho ngữ pháp siêu nhẹ trả về trang luyện tập (Chặn đứng words)
// @route   GET /api/vocab/all-grammar-points
export const getAllGrammarPointsOnly = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  console.log("📥 [API] Đang quét tổng kho ngữ pháp tối ưu...");

  const rawLists = await VocabList.find({}).select("title grammarPoints");
  const flattenedGrammars: any[] = [];

  rawLists.forEach((topic) => {
    if (topic.grammarPoints && Array.isArray(topic.grammarPoints)) {
      topic.grammarPoints.forEach((g: any) => {
        flattenedGrammars.push({
          _id: g._id,
          title: g.title,
          formula: g.formula,
          meaning: g.meaning,
          // 🚀 BẬT KHIÊN PHÒNG THỦ: Tránh crash App Frontend khi bốc trúng data cũ
          examples: g.examples && g.examples.length > 0 ? g.examples : (g.example ? [g.example] : []),
          belongingTopic: topic.title, 
          topicId: topic._id,          
        });
      });
    }
  });

  console.log(`🟢 [API] Đã đóng gói xong ${flattenedGrammars.length} cấu trúc ngữ pháp sạch sẽ.`);

  res.status(200).json({
    success: true,
    data: flattenedGrammars,
  });
});