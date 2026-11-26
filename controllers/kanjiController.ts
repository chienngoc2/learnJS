import type { Request, Response } from "express";
import Kanji from "../models/Kanji.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { NotFoundError, ValidationError, ConflictError } from "../utils/errors.js";
import { cleanPinyinForMatching } from "../utils/pinyinUtils.js";
import { getWordInsights } from "../utils/wordInsights.js";
import { decomposeWordWithRadicals, getAll214Radicals } from "../utils/radicalDecomposer.js";
import { getFullWordAnalysis } from "../utils/wordAnalysisService.js";
import {
  collectCombinedVocabPool,
  escapeRegex,
  scoreSearchMatch,
  upsertSharedVocabBatch,
} from "../utils/sharedVocabService.js";

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
  pinyin?: string;
  zhuyin?: string;
  onyomi?: string;
  kunyomi?: string;
  vietnamese_reading: string;
  level: string;
  components?: string[];
  story?: string;
  lessonGroup?: string;
  stroke_order?: string[];
  example_words?: ExampleWord[];
  onyomi_examples?: ExampleWord[];
  kunyomi_examples?: ExampleWord[];
}

const safeTrim = (val: any): string => {
  if (typeof val === "string") return val.trim();
  if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean).join(", ");
  return val ? String(val).trim() : "";
};

// =========================================================================
// 🔍 1. TÌM KIẾM CHỮ HÁN PHỒN THỂ / TỪ VỰNG HỢP NHẤT
//    (SharedVocab + VocabList + ReadingPassage + WordAnalysis + Kanji + Master)
// @route GET /api/kanji/search?q=一
// =========================================================================
export const searchKanji = asyncHandler(async (
  req: Request,
  res: Response,
): Promise<void> => {
  const q = (req.query.q as string || "").trim();

  if (!q) {
    throw new ValidationError("Thiếu từ khóa tìm kiếm!");
  }

  // 1. Tìm trong bảng Kanji MongoDB (escape regex tránh lỗi ký tự đặc biệt)
  const queryRegex = new RegExp(escapeRegex(q), "i");
  const [kanjiDoc, combinedAllWords] = await Promise.all([
    Kanji.findOne({
      $or: [
        { character: q },
        { pinyin: queryRegex },
        { zhuyin: queryRegex },
        { vietnamese_reading: queryRegex },
        { meaning: queryRegex },
      ],
    }),
    collectCombinedVocabPool(),
  ]);

  // 2. Chấm điểm & sắp xếp toàn bộ kết quả khớp theo độ liên quan
  const rankedMatches = combinedAllWords
    .map((item) => ({ item, score: scoreSearchMatch(item, q) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.word.length - b.item.word.length);

  const targetWord = rankedMatches[0]?.item || null;

  const qCleanPinyin = cleanPinyinForMatching(q);
  const pinyinMatches = qCleanPinyin && qCleanPinyin.length >= 1
    ? combinedAllWords.filter((w) => {
        const wp = w.cleanPinyin || cleanPinyinForMatching(w.pinyin || "");
        return wp === qCleanPinyin || wp.startsWith(qCleanPinyin) || (qCleanPinyin.length >= 2 && wp.includes(qCleanPinyin));
      }).slice(0, 40)
    : [];

  const mainCharacterStr = targetWord?.word || kanjiDoc?.character || q;
  const individualChars = mainCharacterStr
    .split("")
    .filter((ch: string) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch));

  // Nếu không khớp bất kỳ từ nào và cũng không chứa chữ Hán -> trả về null để UI báo không tìm thấy rõ ràng
  if (!targetWord && !kanjiDoc && individualChars.length === 0) {
    res.json({
      success: true,
      data: null,
      message: "Không tìm thấy từ vựng hoặc chữ Hán này.",
    });
    return;
  }

  // Nếu là chữ Hán chưa có trong kho từ điển -> tự tra cứu AI 1 lần và cache vào WordAnalysis + SharedVocab
  let aiFallback: any = null;
  if (!targetWord && !kanjiDoc && individualChars.length > 0 && q.length <= 8) {
    try {
      aiFallback = await getFullWordAnalysis(q);
    } catch (e) {
      // ignore AI error, fall back to character composition
    }
  }

  // Quét tất cả từ ghép / từ liên quan chứa bất kỳ chữ Hán nào
  const relatedWords: ExampleWord[] = [];
  const seenWords = new Set<string>();

  combinedAllWords.forEach((w) => {
    const isRelated = individualChars.some((ch: string) => w.word.includes(ch));
    if (isRelated && !seenWords.has(w.word)) {
      seenWords.add(w.word);
      relatedWords.push({
        word: w.word,
        reading: w.pinyin || "",
        meaning: w.meaning || "",
      });
    }
  });

  const character = mainCharacterStr;
  let pinyin = targetWord?.pinyin || kanjiDoc?.pinyin || aiFallback?.pinyin || "";
  if (!pinyin && individualChars.length > 0) {
    const charPinyins = individualChars.map((ch: string) => {
      const found = combinedAllWords.find((w) => w.word === ch && w.pinyin);
      return found?.pinyin || "";
    });
    if (charPinyins.some(Boolean)) {
      pinyin = charPinyins.filter(Boolean).join(" ");
    }
  }

  const zhuyin = kanjiDoc?.zhuyin || "";
  const vietnamese_reading =
    kanjiDoc?.vietnamese_reading ||
    targetWord?.hanviet ||
    aiFallback?.hanviet ||
    (targetWord?.meaning && targetWord.meaning.length <= 25 ? targetWord.meaning : "") ||
    "Phồn Thể";
  const meaning =
    targetWord?.meaning ||
    kanjiDoc?.meaning ||
    aiFallback?.meaning ||
    "Từ vựng tiếng Trung Phồn Thể";
  const level = targetWord?.level || kanjiDoc?.level || "Bài học";

  const combinedExamples = [
    ...(kanjiDoc?.example_words || []),
    ...relatedWords,
  ].filter((item, idx, arr) => arr.findIndex((x) => x.word === item.word) === idx);

  const aiExamples = Array.isArray(aiFallback?.usages)
    ? aiFallback.usages
        .filter((u: any) => u?.exampleCn)
        .map((u: any) => ({
          cn: u.exampleCn,
          pinyin: u.examplePinyin || "",
          vn: u.exampleVn || u.meaning || "",
        }))
    : [];

  const sampleExamples = aiExamples.length > 0
    ? aiExamples
    : [
        {
          cn: `這是${character}。`,
          pinyin: `Zhè shì ${pinyin || character}.`,
          vn: `Đây là ${meaning.split(",")[0]}.`,
        },
      ];

  res.json({
    success: true,
    data: {
      character,
      characters: individualChars.length > 0 ? individualChars : [character[0] || character],
      pinyin,
      zhuyin,
      vietnamese_reading,
      meaning,
      level,
      example_words: combinedExamples,
      examples: sampleExamples,
      story: kanjiDoc?.story || aiFallback?.combinedStory || "",
      components: kanjiDoc?.components || [],
      pinyin_matches: pinyinMatches,
      matched_candidates: rankedMatches.slice(0, 12).map((m) => ({
        word: m.item.word,
        pinyin: m.item.pinyin,
        meaning: m.item.meaning,
        level: m.item.level,
      })),
    },
  });
});

// =========================================================================
// 📚 1b. DANH SÁCH TỪ VỰNG TRA CỨU CHUNG (SharedVocab + Bài học + Bài đọc + AI + Kanji + Master)
// @route GET /api/kanji/searchable-words
// =========================================================================
export const getSearchableWordsController = asyncHandler(async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const pool = await collectCombinedVocabPool();
  res.json({
    success: true,
    total: pool.length,
    data: pool.map((w) => ({
      word: w.word,
      pinyin: w.pinyin,
      hanviet: w.hanviet,
      meaning: w.meaning,
      level: w.level,
      source: w.source,
    })),
  });
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
    pinyin: body.pinyin?.trim() || "",
    zhuyin: body.zhuyin?.trim() || "",
    onyomi: safeTrim(body.onyomi),
    kunyomi: safeTrim(body.kunyomi),
    vietnamese_reading: body.vietnamese_reading.trim(),
    level: (body.level || "TOCFL A1").trim(),
    stroke_order: body.stroke_order || [],
    example_words: body.example_words || [],
    onyomi_examples: body.onyomi_examples || [],
    kunyomi_examples: body.kunyomi_examples || [],
    components: body.components || [],
    story: body.story?.trim() || "",
    lessonGroup: body.lessonGroup?.trim() || "",
  });

  await newKanji.save();
  upsertSharedVocabBatch(
    [
      {
        word: newKanji.character,
        pinyin: newKanji.pinyin,
        hanviet: newKanji.vietnamese_reading,
        meaning: newKanji.meaning,
        level: newKanji.lessonGroup || newKanji.level,
      },
      ...(newKanji.example_words || []).map((ew: any) => ({
        word: ew.word,
        pinyin: ew.reading,
        meaning: ew.meaning,
        level: newKanji.lessonGroup || newKanji.level,
      })),
    ],
    newKanji.lessonGroup || "Kanji"
  );

  res.status(201).json({
    success: true,
    message: `🎉 Đã thêm Chữ Hán "${body.character}" thành công!`,
    data: newKanji,
  });
});

// =========================================================================
// 📦 4. THÊM HÀNG LOẠT KANJI/HANZI - UPSERT
// @route POST /api/kanji/bulk-add
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
    throw new ValidationError("Vui lòng truyền mảng 'items' chứa danh sách chữ Hán!");
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

      const finalLevel = item.level?.trim() || defaultLevel?.trim() || "TOCFL A1";
      const finalGroup = item.lessonGroup?.trim() || defaultLessonGroup?.trim() || "";

      const updateData = {
        meaning: item.meaning.trim(),
        pinyin: item.pinyin?.trim() || "",
        zhuyin: item.zhuyin?.trim() || "",
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

  const addedWordsForShared = items
    .filter((i) => i?.character && i?.meaning)
    .flatMap((i) => [
      {
        word: i.character.trim(),
        pinyin: i.pinyin?.trim() || "",
        hanviet: i.vietnamese_reading?.trim() || "",
        meaning: i.meaning.trim(),
        level: i.lessonGroup?.trim() || defaultLessonGroup?.trim() || i.level || defaultLevel || "Kanji",
      },
      ...((i.example_words || []).map((ew) => ({
        word: ew.word,
        pinyin: ew.reading,
        meaning: ew.meaning,
        level: i.lessonGroup?.trim() || defaultLessonGroup?.trim() || "Kanji",
      }))),
    ]);
  upsertSharedVocabBatch(addedWordsForShared, defaultLessonGroup || "Kanji");

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

// =========================================================================
// 💡 7. TRA CỨU TỪ ĐỒNG NGHĨA, GẦN NGHĨA & CÁCH DÙNG NGỮ PHÁP (INSIGHTS)
// @route GET /api/kanji/insights?q=好
// =========================================================================
export const getWordInsightsController = asyncHandler(async (
  req: Request,
  res: Response,
): Promise<void> => {
  const q = ((req.query.q || req.query.word) as string || "").trim();
  if (!q) {
    throw new ValidationError("Thiếu từ vựng tra cứu (q hoặc word)!");
  }

  const result = await getWordInsights(q);
  res.json({
    success: true,
    data: result,
  });
});

// =========================================================================
// 🧩 8. BẢNG 214 BỘ THỦ KHANG HY & PHÂN TÁCH BỘ THỦ + CÂU CHUYỆN AI
// =========================================================================
export const getRadicals214Controller = asyncHandler(async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const radicals = getAll214Radicals();
  res.json({
    success: true,
    total: radicals.length,
    data: radicals,
  });
});

export const decomposeWordController = asyncHandler(async (
  req: Request,
  res: Response,
): Promise<void> => {
  const word = String(req.query.word || req.query.q || req.body?.word || "").trim();
  if (!word) {
    throw new ValidationError("Thiếu từ vựng cần phân tích bộ thủ!");
  }
  const forceRefresh =
    req.query.refresh === "true" || req.query.refresh === "1" || req.body?.refresh === true;
  const result = await decomposeWordWithRadicals(word, forceRefresh);
  res.json({
    success: true,
    data: result,
  });
});

export const getWordAnalysisController = asyncHandler(async (
  req: Request,
  res: Response,
): Promise<void> => {
  const word = String(req.query.word || req.query.q || req.body?.word || "").trim();
  if (!word) {
    throw new ValidationError("Thiếu từ vựng cần phân tích!");
  }
  const forceRefresh =
    req.query.refresh === "true" || req.query.refresh === "1" || req.body?.refresh === true;
  const result = await getFullWordAnalysis(word, forceRefresh);
  res.json({
    success: true,
    data: result,
  });
});

