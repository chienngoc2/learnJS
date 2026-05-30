// File: controllers/vocabController.ts

import type { Request, Response } from "express";
import mongoose from "mongoose";
import VocabList from "../models/VocabList.js"; // Sếp kiểm tra lại hậu tố .ts/.js tùy cấu hình dự án nha

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
export const getAllLists = async (req: Request, res: Response): Promise<void> => {
  try {
    const lists = await VocabList.find()
      .select("title createdAt words")
      .sort({ createdAt: -1 });
    res.json({ success: true, data: lists });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Lấy chi tiết 1 bài học theo ID
// @route   GET /api/vocab/list/:id
export const getListById = async (req: Request, res: Response): Promise<void> => {
  try {
    const list = await VocabList.findById(req.params.id);
    if (!list) {
      res.status(404).json({ success: false, message: "Không tìm thấy bài học" });
      return;
    }
    res.json({ success: true, data: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Lưu bài học mới
// @route   POST /api/vocab/save
export const createList = async (
  req: Request<{}, {}, VocabRequestBody>, 
  res: Response
): Promise<void> => {
  try {
    const { title, list } = req.body;
    const newList = new VocabList({
      title: title,
      words: list,
    });
    await newList.save();
    res.json({ success: true, data: newList });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Lưu hoặc cập nhật bài "Cần ôn tập"
// @route   POST /api/vocab/save-review
export const saveReviewList = async (
  req: Request<{}, {}, VocabRequestBody>, 
  res: Response
): Promise<void> => {
  try {
    const { title, list } = req.body;
    let existing = await VocabList.findOne({ title: title });

    if (existing) {
      const oldWords = (existing.words as any[]).map((w) => w.term);
      const newUniqueWords = list.filter((w) => !oldWords.includes(w.term));
      
      (existing.words as any[]).push(...newUniqueWords);
      await existing.save();
    } else {
      const newList = new VocabList({ title, words: list });
      await newList.save();
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false });
  }
};

// @desc    Cập nhật bài học hiện có (Từ vựng)
// @route   PUT /api/vocab/update/:id
export const updateList = async (
  req: Request<{ id: string }, {}, VocabRequestBody>, 
  res: Response
): Promise<void> => {
  try {
    const { title, list } = req.body;
    const updatedList = await VocabList.findByIdAndUpdate(
      req.params.id,
      { title: title, words: list },
      { new: true }
    );
    res.json({ success: true, data: updatedList });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// @desc    Xóa bài học theo ID
// @route   DELETE /api/vocab/delete/:id
export const deleteList = async (req: Request, res: Response): Promise<void> => {
  try {
    const deleted = await VocabList.findByIdAndDelete(req.params.id);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Không tìm thấy bài học để xóa" });
      return;
    }
    res.json({ success: true, message: "Đã xóa bài học thành công" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// =========================================================================
// 🔥 3. CÁC HÀM XỬ LÝ NGỮ PHÁP TỐI ƯU HÓA (GRAMMAR CONTROLLERS)
// =========================================================================

// @desc    Thêm mới hoặc tạo mới bài học chứa ngữ pháp
// @route   POST /api/vocab/add-grammar-upsert
export const addOrUpdateGrammar = async (
  req: Request<{}, {}, AddGrammarReqBody>, 
  res: Response
): Promise<void> => {
  try {
    const { topicName, grammarPoints } = req.body;

    if (!topicName || !grammarPoints || grammarPoints.length === 0) {
      res.status(400).json({ success: false, message: "Thiếu dữ liệu sếp ơi!" });
      return;
    }

    const cleanTopicName = topicName.trim();

    // 1. Tìm xem bài học đã tồn tại chưa
    const existingList = await VocabList.findOne({ title: cleanTopicName });

    if (existingList) {
      // TRƯỜNG HỢP 1: Tồn tại -> Chỉ cần Push thêm vào mảng cũ
      await VocabList.updateOne(
        { _id: existingList._id },
        { $push: { grammarPoints: { $each: grammarPoints } } }
      );
      
      res.status(200).json({ 
        success: true, 
        message: "Đã thêm ngữ pháp vào bài học hiện có!" 
      });
    } else {
      // TRƯỜNG HỢP 2: Chưa tồn tại -> Tạo mới hoàn toàn
      const newList = new VocabList({
        title: cleanTopicName,
        grammarPoints: grammarPoints,
        words: [] // Khởi tạo mảng trống để không vi phạm Schema (nếu có yêu cầu)
      });
      
      await newList.save();
      
      res.status(200).json({ 
        success: true, 
        message: "Đã tạo mới bài học và lưu ngữ pháp thành công!" 
      });
    }

  } catch (error: any) {
    console.error("❌ Lỗi logic thêm/tạo bài học:", error.message);
    res.status(500).json({ success: false, message: "Lỗi Server nội bộ." });
  }
};
// @desc    Cập nhật 1 cấu trúc ngữ pháp cụ thể bằng cách định vị cặp ID truyền vào
// @route   PUT /api/vocab/update-grammar/:topicId/:grammarId
export const updateSingleGrammar = async (req: Request, res: Response): Promise<void> => {
  try {
    const topicId = req.params.topicId as string;
    const grammarId = req.params.grammarId as string;
    const { title, formula, meaning, examples, topicName } = req.body;

    //  CHẮN LỖI PARAMS: Ép kiểm tra xem 2 ID nhảy từ route sang có chuẩn cấu trúc Mongo hay không
    if (!mongoose.Types.ObjectId.isValid(topicId) || !mongoose.Types.ObjectId.isValid(grammarId)) {
      res.status(400).json({ 
        success: false, 
        message: `ID bài học hoặc ID ngữ pháp sai định dạng ObjectId sếp ơi! Nhận được: topicId=${topicId}, grammarId=${grammarId}` 
      });
      return;
    }

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
          "grammarPoints.$.examples": examples, // 🚀 ĐÃ FIX LOGIC MỚI: Lưu mảng chuỗi examples đồng bộ với FE
          "grammarPoints.$.topicName": topicName
        }
      },
      { new: true }
    );

    if (!result) {
      res.status(404).json({ 
        success: false, 
        message: "Không tìm thấy bài học hoặc cấu trúc ngữ pháp này để chỉnh sửa sếp ơi!" 
      });
      return;
    }

    res.status(200).json({ 
      success: true, 
      message: "Cập nhật cấu trúc ngữ pháp và danh sách ví dụ thành công!", 
      data: result 
    });
  } catch (error: any) {
    console.error("❌ Lỗi khi cập nhật 1 ngữ pháp cụ thể:", error.message);
    res.status(500).json({ success: false, message: "Lỗi Server nội bộ khi chỉnh sửa." });
  }
};

// @desc    Xóa 1 cấu trúc ngữ pháp cụ thể ra khỏi mảng danh mục
// @route   DELETE /api/vocab/delete-grammar/:topicId/:grammarId
export const deleteSingleGrammar = async (req: Request, res: Response): Promise<void> => {
  try {
    const topicId = req.params.topicId as string;
    const grammarId = req.params.grammarId as string;

    if (!mongoose.Types.ObjectId.isValid(topicId) || !mongoose.Types.ObjectId.isValid(grammarId)) {
      res.status(400).json({ success: false, message: "ID truyền lên không đúng cấu trúc ObjectId hệ thống." });
      return;
    }

    const result = await VocabList.findByIdAndUpdate(
      topicId,
      { 
        $pull: { grammarPoints: { _id: grammarId } } 
      },
      { new: true } 
    );

    if (!result) {
      res.status(404).json({ 
        success: false, 
        message: "Không tìm thấy bài học để tiến hành xóa xương cấu trúc này sếp ơi!" 
      });
      return;
    }

    res.status(200).json({ 
      success: true, 
      message: "Đã xóa cấu trúc ngữ pháp này thành công!", 
      data: result 
    });
  } catch (error: any) {
    console.error("Lỗi khi xóa 1 ngữ pháp:", error.message);
    res.status(500).json({ success: false, message: "Lỗi Server nội bộ khi xóa bỏ dữ liệu." });
  }
};

// @desc    Bốc tổng kho ngữ pháp siêu nhẹ trả về trang luyện tập (Chặn đứng words)
// @route   GET /api/vocab/all-grammar-points
export const getAllGrammarPointsOnly = async (req: Request, res: Response): Promise<void> => {
  try {
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
  } catch (error: any) {
    console.error("❌ Lỗi API getAllGrammarPointsOnly:", error.message);
    res.status(500).json({ success: false, error: "Không thể bốc kho dữ liệu ngữ pháp." });
  }
};