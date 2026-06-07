import { Request, Response } from "express";
import Kanji from "../models/Kanji.js";

// =========================================================================
// 📦 INTERFACE CHUẨN CHO KANJI ITEM
// =========================================================================
interface KanjiItem {
  character: string;
  meaning: string;
  onyomi: string;
  kunyomi: string;
  vietnamese_reading: string;
  level: string;
  components?: string[];
  story?: string;
  lessonGroup?: string; // Tên bài học / nhóm bộ
  stroke_order?: string[];
  example_words?: { word: string; reading: string; meaning: string }[];
}

// =========================================================================
// 🔍 1. TÌM KIẾM KANJI
// @route GET /api/kanji/search?q=一
// =========================================================================
export const searchKanji = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const q = req.query.q as string;

    if (!q) {
      res
        .status(400)
        .json({ success: false, message: "Thiếu từ khóa tìm kiếm sếp ơi!" });
      return;
    }

    const queryRegex = new RegExp(q.trim(), "i");

    const result = await Kanji.findOne({
      $or: [
        { character: q.trim() },
        { vietnamese_reading: queryRegex },
        { meaning: queryRegex },
      ],
    });

    if (!result) {
      res.json({
        success: true,
        data: null,
        message: "Không tìm thấy chữ này rồi.",
      });
      return;
    }

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// =========================================================================
// 📊 2. LẤY TẤT CẢ KANJI (có phân trang + lọc theo level & lessonGroup)
// @route GET /api/kanji/all?page=1&limit=20&level=N5&group=xxx
// =========================================================================
export const getAllKanji = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const level = req.query.level as string;
    const group = req.query.group as string;

    const filter: any = {};
    if (level && level !== "ALL") {
      filter.level = level;
    }
    if (group) {
      filter.lessonGroup = group;
    }

    const skip = (page - 1) * limit;
    const total = await Kanji.countDocuments(filter);
    const data = await Kanji.find(filter)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// =========================================================================
// 📚 3. LẤY DANH SÁCH BỘ/NHÓM BÀI HỌC KANJI
// @route GET /api/kanji/groups
// =========================================================================
export const getKanjiGroups = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // Aggregate để lấy danh sách các nhóm + đếm số kanji + level
    const groups = await Kanji.aggregate([
      {
        $group: {
          _id: "$lessonGroup",
          count: { $sum: 1 },
          levels: { $addToSet: "$level" },
          sampleChars: { $push: "$character" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Tách ra 2 loại: có tên bài học và chưa đặt tên
    const named = groups
      .filter((g) => g._id && g._id.trim() !== "")
      .map((g) => ({
        name: g._id,
        count: g.count,
        levels: g.levels.sort(),
        previewChars: g.sampleChars.slice(0, 6),
      }));

    const unnamedCount = groups
      .filter((g) => !g._id || g._id.trim() === "")
      .reduce((sum, g) => sum + g.count, 0);

    res.json({
      success: true,
      data: named,
      unnamedCount, // số kanji chưa xếp nhóm
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// =========================================================================
// 🆕 4. THÊM 1 KANJI MỚI
// @route POST /api/kanji/add
// =========================================================================
export const addKanji = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const body: KanjiItem = req.body;

    if (!body.character || !body.meaning || !body.vietnamese_reading || !body.level) {
      res.status(400).json({
        success: false,
        message: "Thiếu thông tin bắt buộc: character, meaning, vietnamese_reading, level!",
      });
      return;
    }

    // Kiểm tra trùng lặp
    const existing = await Kanji.findOne({ character: body.character.trim() });
    if (existing) {
      res.status(409).json({
        success: false,
        message: `Kanji "${body.character}" đã tồn tại trong database rồi sếp ơi!`,
      });
      return;
    }

    const newKanji = new Kanji({
      character: body.character.trim(),
      meaning: body.meaning.trim(),
      onyomi: body.onyomi?.trim() || "",
      kunyomi: body.kunyomi?.trim() || "",
      vietnamese_reading: body.vietnamese_reading.trim(),
      level: body.level.trim().toUpperCase(),
      stroke_order: body.stroke_order || [],
      example_words: body.example_words || [],
      components: body.components || [],
      story: body.story?.trim() || "",
      lessonGroup: body.lessonGroup?.trim() || "",
    });

    await newKanji.save();

    res.status(201).json({
      success: true,
      message: `🎉 Đã thêm Kanji "${body.character}" thành công!`,
      data: newKanji,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// =========================================================================
// 📦 4. THÊM HÀNG LOẠT KANJI (Bulk Insert từ JSON)
// @route POST /api/kanji/bulk-add
// =========================================================================
export const bulkAddKanji = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { items } = req.body as { items: KanjiItem[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        success: false,
        message: "Vui lòng truyền mảng 'items' chứa danh sách Kanji!",
      });
      return;
    }

    const results = {
      success: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const item of items) {
      try {
        if (!item.character || !item.meaning || !item.vietnamese_reading || !item.level) {
          results.errors.push(`Thiếu field bắt buộc: ${JSON.stringify(item)}`);
          continue;
        }

        const existing = await Kanji.findOne({ character: item.character.trim() });
        if (existing) {
          results.skipped++;
          continue;
        }

        const newKanji = new Kanji({
          character: item.character.trim(),
          meaning: item.meaning.trim(),
          onyomi: item.onyomi?.trim() || "",
          kunyomi: item.kunyomi?.trim() || "",
          vietnamese_reading: item.vietnamese_reading.trim(),
          level: item.level.trim().toUpperCase(),
          stroke_order: (item as any).stroke_order || [],
          example_words: (item as any).example_words || [],
          components: item.components || [],
          story: item.story?.trim() || "",
          lessonGroup: item.lessonGroup?.trim() || "",
        });

        await newKanji.save();
        results.success++;
      } catch (itemErr: any) {
        results.errors.push(`Lỗi "${item.character}": ${itemErr.message}`);
      }
    }

    res.json({
      success: true,
      message: `✅ Hoàn tất! Thêm mới: ${results.success}, Bỏ qua (đã tồn tại): ${results.skipped}, Lỗi: ${results.errors.length}`,
      data: results,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// =========================================================================
// ✏️ 5. CẬP NHẬT KANJI THEO ID
// @route PUT /api/kanji/update/:id
// =========================================================================
export const updateKanji = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const body: Partial<KanjiItem> = req.body;

    const updated = await Kanji.findByIdAndUpdate(
      id,
      {
        ...(body.character && { character: body.character.trim() }),
        ...(body.meaning && { meaning: body.meaning.trim() }),
        ...(body.onyomi !== undefined && { onyomi: body.onyomi.trim() }),
        ...(body.kunyomi !== undefined && { kunyomi: body.kunyomi.trim() }),
        ...(body.vietnamese_reading && { vietnamese_reading: body.vietnamese_reading.trim() }),
        ...(body.level && { level: body.level.trim().toUpperCase() }),
        ...(body.components && { components: body.components }),
        ...(body.story !== undefined && { story: body.story.trim() }),
        ...(body.lessonGroup !== undefined && { lessonGroup: body.lessonGroup.trim() }),
      },
      { new: true },
    );

    if (!updated) {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy Kanji này trong hệ thống!",
      });
      return;
    }

    res.json({
      success: true,
      message: "✅ Cập nhật Kanji thành công!",
      data: updated,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// =========================================================================
// 🗑️ 6. XÓA KANJI THEO ID
// @route DELETE /api/kanji/delete/:id
// =========================================================================
export const deleteKanji = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;

    const deleted = await Kanji.findByIdAndDelete(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy Kanji để xóa sếp ơi!",
      });
      return;
    }

    res.json({
      success: true,
      message: `🗑️ Đã xóa Kanji "${deleted.character}" thành công!`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// =========================================================================
// 🔎 7. LẤY KANJI THEO ID
// @route GET /api/kanji/:id
// =========================================================================
export const getKanjiById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const kanji = await Kanji.findById(req.params.id);
    if (!kanji) {
      res.status(404).json({ success: false, message: "Không tìm thấy Kanji!" });
      return;
    }
    res.json({ success: true, data: kanji });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
