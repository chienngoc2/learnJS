import { Request, Response } from "express";
import Kanji from "../models/Kanji.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { NotFoundError, ValidationError, ConflictError } from "../utils/errors.js";

// =========================================================================
// 📦 INTERFACE CHUẨN CHO KANJI ITEM
// =========================================================================
interface ExampleWord {
  word: string;
  reading: string;
  meaning: string;
}

interface KanjiItem {
  character: string;
  meaning: string;
  onyomi: string;
  kunyomi: string;
  vietnamese_reading: string;
  level: string;
  components?: string[];
  story?: string;
  lessonGroup?: string;
  stroke_order?: string[];
  example_words?: ExampleWord[];     // legacy, tổng quát
  onyomi_examples?: ExampleWord[];   // 3-4 ví dụ âm ON
  kunyomi_examples?: ExampleWord[];  // 3-4 ví dụ âm KUN
}

const safeTrim = (val: any): string => {
  if (typeof val === "string") return val.trim();
  if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean).join(", ");
  return val ? String(val).trim() : "";
};


// =========================================================================
// 🔍 1. TÌM KIẾM KANJI
// @route GET /api/kanji/search?q=一
// =========================================================================
export const searchKanji = asyncHandler(async (
  req: Request,
  res: Response,
): Promise<void> => {
  const q = req.query.q as string;

  if (!q) {
    throw new ValidationError("Thiếu từ khóa tìm kiếm sếp ơi!");
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
});

// =========================================================================
// 📊 2. LẤY TẤT CẢ KANJI (có phân trang + lọc theo level & lessonGroup)
// @route GET /api/kanji/all?page=1&limit=20&level=N5&group=xxx
// =========================================================================
export const getAllKanji = asyncHandler(async (
  req: Request,
  res: Response,
): Promise<void> => {
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
});

// =========================================================================
// 📚 3. LẤY DANH SÁCH BỘ/NHÓM BÀI HỌC KANJI
// @route GET /api/kanji/groups
// =========================================================================
export const getKanjiGroups = asyncHandler(async (
  req: Request,
  res: Response,
): Promise<void> => {
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
});

// =========================================================================
// 🆕 4. THÊM 1 KANJI MỚI
// @route POST /api/kanji/add
// =========================================================================
export const addKanji = asyncHandler(async (
  req: Request,
  res: Response,
): Promise<void> => {
  const body: KanjiItem = req.body;

  if (!body.character || !body.meaning || !body.vietnamese_reading || !body.level) {
    throw new ValidationError("Thiếu thông tin bắt buộc: character, meaning, vietnamese_reading, level!");
  }

  // Kiểm tra trùng lặp trong cùng nhóm bài học
  const targetGroup = body.lessonGroup?.trim() || "";
  const existing = await Kanji.findOne({
    character: body.character.trim(),
    lessonGroup: targetGroup,
  });
  if (existing) {
    throw new ConflictError(`Kanji "${body.character}" đã tồn tại trong bài học "${targetGroup}" rồi sếp ơi!`);
  }

  const newKanji = new Kanji({
    character: body.character.trim(),
    meaning: body.meaning.trim(),
    onyomi: safeTrim(body.onyomi),
    kunyomi: safeTrim(body.kunyomi),
    vietnamese_reading: body.vietnamese_reading.trim(),
    level: body.level.trim().toUpperCase(),
    stroke_order: body.stroke_order || [],
    example_words: body.example_words || [],
    onyomi_examples: body.onyomi_examples || [],
    kunyomi_examples: body.kunyomi_examples || [],
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
});

// =========================================================================
// 📦 4. THÊM HÀNG LOẠT KANJI - UPSERT (Thêm mới hoặc cập nhật nếu trùng)
// @route POST /api/kanji/bulk-add
// Body: { items: KanjiItem[], defaultLessonGroup?: string, defaultLevel?: string }
// =========================================================================
export const bulkAddKanji = asyncHandler(async (
  req: Request,
  res: Response,
): Promise<void> => {
  const {
    items,
    defaultLessonGroup = "",
    defaultLevel = "",
  } = req.body as {
    items: KanjiItem[];
    defaultLessonGroup?: string;
    defaultLevel?: string;
  };

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ValidationError("Vui lòng truyền mảng 'items' chứa danh sách Kanji!");
  }

  const results = {
    added: 0,    // Thêm mới
    updated: 0,  // Cập nhật (trùng)
    errors: [] as string[],
  };

  for (const item of items) {
    try {
      if (!item.character || !item.meaning || !item.vietnamese_reading) {
        results.errors.push(`Thiếu field (character/meaning/vietnamese_reading): ${item.character || "?"}`);
        continue;
      }

      // Xác định level: ưu tiên item > defaultLevel > "N5"
      const finalLevel = (item.level?.trim() || defaultLevel?.trim() || "N5").toUpperCase();
      // Xác định lessonGroup: ưu tiên item > defaultLessonGroup
      const finalGroup = item.lessonGroup?.trim() || defaultLessonGroup?.trim() || "";

      const updateData = {
        meaning: item.meaning.trim(),
        onyomi: safeTrim(item.onyomi),
        kunyomi: safeTrim(item.kunyomi),
        vietnamese_reading: item.vietnamese_reading.trim(),
        level: finalLevel,
        ...(item.components && item.components.length > 0 && { components: item.components }),
        ...(item.story?.trim() && { story: item.story.trim() }),
        ...(finalGroup && { lessonGroup: finalGroup }),
        ...(item.stroke_order?.length && { stroke_order: item.stroke_order }),
        ...(item.example_words?.length && { example_words: item.example_words }),
        ...(item.onyomi_examples?.length && { onyomi_examples: item.onyomi_examples }),
        ...(item.kunyomi_examples?.length && { kunyomi_examples: item.kunyomi_examples }),
      };

      const existing = await Kanji.findOne({
        character: item.character.trim(),
        lessonGroup: finalGroup,
      });

      if (existing) {
        // UPSERT: cập nhật thay vì bỏ qua
        await Kanji.findByIdAndUpdate(existing._id, updateData, { new: true });
        results.updated++;
      } else {
        // INSERT MỚI
        const newKanji = new Kanji({
          character: item.character.trim(),
          ...updateData,
        });
        await newKanji.save();
        results.added++;
      }
    } catch (itemErr: any) {
      results.errors.push(`Lỗi "${item.character}": ${itemErr.message}`);
    }
  }

  res.json({
    success: true,
    message: `✅ Hoàn tất! Thêm mới: ${results.added} | Cập nhật: ${results.updated} | Lỗi: ${results.errors.length}`,
    data: results,
  });
});



// =========================================================================
// ✏️ 5. CẬP NHẬT KANJI THEO ID
// @route PUT /api/kanji/update/:id
// =========================================================================
export const updateKanji = asyncHandler(async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const body: Partial<KanjiItem> = req.body;

  const updated = await Kanji.findByIdAndUpdate(
    id,
    {
      ...(body.character && { character: body.character.trim() }),
      ...(body.meaning && { meaning: body.meaning.trim() }),
      ...(body.onyomi !== undefined && { onyomi: safeTrim(body.onyomi) }),
      ...(body.kunyomi !== undefined && { kunyomi: safeTrim(body.kunyomi) }),
      ...(body.vietnamese_reading && { vietnamese_reading: body.vietnamese_reading.trim() }),
      ...(body.level && { level: body.level.trim().toUpperCase() }),
      ...(body.components && { components: body.components }),
      ...(body.story !== undefined && { story: body.story.trim() }),
      ...(body.lessonGroup !== undefined && { lessonGroup: body.lessonGroup.trim() }),
      ...(body.onyomi_examples !== undefined && { onyomi_examples: body.onyomi_examples }),
      ...(body.kunyomi_examples !== undefined && { kunyomi_examples: body.kunyomi_examples }),
    },
    { new: true },
  );

  if (!updated) {
    throw new NotFoundError("Không tìm thấy Kanji này trong hệ thống!");
  }

  res.json({
    success: true,
    message: "✅ Cập nhật Kanji thành công!",
    data: updated,
  });
});

// =========================================================================
// 🗑️ 6. XÓA KANJI THEO ID
// @route DELETE /api/kanji/delete/:id
// =========================================================================
export const deleteKanji = asyncHandler(async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;

  const deleted = await Kanji.findByIdAndDelete(id);

  if (!deleted) {
    throw new NotFoundError("Không tìm thấy Kanji để xóa sếp ơi!");
  }

  res.json({
    success: true,
    message: `🗑️ Đã xóa Kanji "${deleted.character}" thành công!`,
  });
});

// =========================================================================
// 🔎 7. LẤY KANJI THEO ID
// @route GET /api/kanji/:id
// =========================================================================
export const getKanjiById = asyncHandler(async (
  req: Request,
  res: Response,
): Promise<void> => {
  const kanji = await Kanji.findById(req.params.id);
  if (!kanji) {
    throw new NotFoundError("Không tìm thấy Kanji!");
  }
  res.json({ success: true, data: kanji });
});

// =========================================================================
// 🗑️ 6b. XÓA TOÀN BỘ NHÓM BÀI HỌC KANJI
// @route DELETE /api/kanji/group
// =========================================================================
export const deleteKanjiGroup = asyncHandler(async (
  req: Request,
  res: Response,
): Promise<void> => {
  const group = req.query.group as string;

  if (group === undefined) {
    throw new ValidationError("Thiếu tên nhóm bài học cần xóa sếp ơi!");
  }

  const trimmedGroup = group.trim();

  let query: any = {};
  if (trimmedGroup === "__unnamed__" || trimmedGroup === "") {
    query = { $or: [{ lessonGroup: "" }, { lessonGroup: { $exists: false } }, { lessonGroup: null }] };
  } else {
    query = { lessonGroup: trimmedGroup };
  }

  const result = await Kanji.deleteMany(query);

  res.json({
    success: true,
    message: `🗑️ Đã xóa thành công bài học "${trimmedGroup === "__unnamed__" || trimmedGroup === "" ? "Chưa phân loại" : trimmedGroup}" (${result.deletedCount} chữ Kanji)!`,
    deletedCount: result.deletedCount,
  });
});
