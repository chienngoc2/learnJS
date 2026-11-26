import WordAnalysis from "../models/WordAnalysis.js";
import { decomposeWordWithRadicals, CharacterDecomposition } from "./radicalDecomposer.js";
import { getWordInsights } from "./wordInsights.js";
import { upsertSharedVocabBatch } from "./sharedVocabService.js";

export interface FullWordAnalysisResult {
  word: string;
  pinyin: string;
  hanviet: string;
  meaning: string;
  synonyms: Array<{ word: string; pinyin: string; meaning: string; difference?: string }>;
  usages: Array<{ pattern: string; meaning: string; exampleCn: string; examplePinyin: string; exampleVn: string }>;
  characters: CharacterDecomposition[];
  combinedStory: string;
  fromCache?: boolean;
}

function hasCompleteRadicals(chars: any): boolean {
  return (
    Array.isArray(chars) &&
    chars.length > 0 &&
    chars.every((c: any) => Array.isArray(c?.radicals) && c.radicals.length > 0)
  );
}

function unescapeText(str?: string): string {
  if (!str) return "";
  return String(str).replace(/\\u0027/g, "'").replace(/\\u0022/g, '"');
}

/**
 * Lấy phân tích toàn diện của một từ vựng (214 bộ thủ màu sắc + câu chuyện AI + đồng nghĩa + mẫu câu).
 * Luôn ưu tiên đọc từ bảng WordAnalysis trên MongoDB để không tốn token AI cho các lần mở sau.
 */
export async function getFullWordAnalysis(
  rawWord: string,
  forceRefresh = false
): Promise<FullWordAnalysisResult> {
  const word = (rawWord || "").trim();
  if (!word) {
    return {
      word: "",
      pinyin: "",
      hanviet: "",
      meaning: "",
      synonyms: [],
      usages: [],
      characters: [],
      combinedStory: "",
    };
  }

  let cachedDoc: any = null;

  // 1. Kiểm tra cache vĩnh viễn trên MongoDB (bỏ qua nếu người dùng bấm "Phân tích lại")
  if (!forceRefresh) {
    try {
      cachedDoc = await WordAnalysis.findOne({ word }).lean();
      if (
        cachedDoc &&
        hasCompleteRadicals(cachedDoc.characters) &&
        ((Array.isArray(cachedDoc.usages) && cachedDoc.usages.length > 0) ||
          (Array.isArray(cachedDoc.synonyms) && cachedDoc.synonyms.length > 0))
      ) {
        return {
          word: cachedDoc.word,
          pinyin: cachedDoc.pinyin || "",
          hanviet: cachedDoc.hanviet || "",
          meaning: unescapeText(cachedDoc.meaning),
          synonyms: (cachedDoc.synonyms || []).map((s: any) => ({
            ...s,
            meaning: unescapeText(s?.meaning),
            difference: unescapeText(s?.difference),
          })),
          usages: (cachedDoc.usages || []).map((u: any) => ({
            ...u,
            meaning: unescapeText(u?.meaning),
            exampleVn: unescapeText(u?.exampleVn),
          })),
          characters: cachedDoc.characters as CharacterDecomposition[],
          combinedStory: unescapeText(cachedDoc.combinedStory),
          fromCache: true,
        };
      }
    } catch (err: any) {
      console.warn("⚠️ [WordAnalysis] Lỗi đọc MongoDB cache:", err.message);
    }
  }

  // 2. Nếu cache cũ bị thiếu bộ thủ (vd: radicals: []) nhưng đã có insights -> chỉ cần chạy lại phần bộ thủ
  const needsDecomp = forceRefresh || !hasCompleteRadicals(cachedDoc?.characters);
  const needsInsights =
    forceRefresh ||
    !cachedDoc ||
    (!Array.isArray(cachedDoc.usages) || cachedDoc.usages.length === 0) &&
      (!Array.isArray(cachedDoc.synonyms) || cachedDoc.synonyms.length === 0);

  const [decomp, insights] = await Promise.all([
    needsDecomp
      ? decomposeWordWithRadicals(word, true)
      : Promise.resolve({
          word,
          characters: cachedDoc.characters as CharacterDecomposition[],
          combinedStory: cachedDoc.combinedStory || "",
        }),
    needsInsights
      ? getWordInsights(word, forceRefresh)
      : Promise.resolve({
          word,
          pinyin: cachedDoc.pinyin || "",
          hanviet: cachedDoc.hanviet || "",
          meaning: cachedDoc.meaning || "",
          synonyms: cachedDoc.synonyms || [],
          usages: cachedDoc.usages || [],
        }),
  ]);

  const merged: FullWordAnalysisResult = {
    word,
    pinyin: insights.pinyin || decomp.characters.map((c) => c.pinyin).filter(Boolean).join(" ") || "",
    hanviet: insights.hanviet || decomp.characters.map((c) => c.hanViet).filter(Boolean).join(" ") || "",
    meaning: unescapeText(insights.meaning),
    synonyms: (insights.synonyms || []).map((s: any) => ({
      ...s,
      meaning: unescapeText(s?.meaning),
      difference: unescapeText(s?.difference),
    })),
    usages: (insights.usages || []).map((u: any) => ({
      ...u,
      meaning: unescapeText(u?.meaning),
      exampleVn: unescapeText(u?.exampleVn),
    })),
    characters: decomp.characters || [],
    combinedStory: unescapeText(decomp.combinedStory),
    fromCache: false,
  };

  // 3. Chỉ lưu vào bảng WordAnalysis khi bộ thủ ĐẦY ĐỦ (tránh ghi đè cache rỗng bị hỏng)
  if (hasCompleteRadicals(merged.characters)) {
    try {
      await WordAnalysis.findOneAndUpdate(
        { word },
        {
          $set: {
            word: merged.word,
            pinyin: merged.pinyin,
            hanviet: merged.hanviet,
            meaning: merged.meaning,
            synonyms: merged.synonyms,
            usages: merged.usages,
            characters: merged.characters,
            combinedStory: merged.combinedStory,
          },
        },
        { upsert: true, new: true }
      );
      await upsertSharedVocabBatch(
        [
          {
            word: merged.word,
            pinyin: merged.pinyin,
            hanviet: merged.hanviet,
            meaning: merged.meaning,
            level: "AI Phân tích",
          },
        ],
        "AI Phân tích"
      );
    } catch (saveErr: any) {
      console.warn("⚠️ [WordAnalysis] Lỗi lưu MongoDB cache:", saveErr.message);
    }
  }

  return merged;
}
