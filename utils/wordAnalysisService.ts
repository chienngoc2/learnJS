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

  // 1. Kiểm tra cache vĩnh viễn trên MongoDB (bỏ qua nếu người dùng bấm "Phân tích lại")
  if (!forceRefresh) {
    try {
      const cached = await WordAnalysis.findOne({ word }).lean();
      if (
        cached &&
        Array.isArray(cached.characters) &&
        cached.characters.length > 0 &&
        ((Array.isArray(cached.usages) && cached.usages.length > 0) ||
          (Array.isArray(cached.synonyms) && cached.synonyms.length > 0))
      ) {
        return {
          word: cached.word,
          pinyin: cached.pinyin || "",
          hanviet: cached.hanviet || "",
          meaning: cached.meaning || "",
          synonyms: cached.synonyms || [],
          usages: cached.usages || [],
          characters: cached.characters as CharacterDecomposition[],
          combinedStory: cached.combinedStory || "",
          fromCache: true,
        };
      }
    } catch (err: any) {
      console.warn("⚠️ [WordAnalysis] Lỗi đọc MongoDB cache:", err.message);
    }
  }

  // 2. Chưa có cache đầy đủ hoặc yêu cầu phân tích lại -> chạy song song AI mới (skip cache)
  const [decomp, insights] = await Promise.all([
    decomposeWordWithRadicals(word, forceRefresh),
    getWordInsights(word, forceRefresh),
  ]);

  const merged: FullWordAnalysisResult = {
    word,
    pinyin: insights.pinyin || decomp.characters.map((c) => c.pinyin).filter(Boolean).join(" ") || "",
    hanviet: insights.hanviet || decomp.characters.map((c) => c.hanViet).filter(Boolean).join(" ") || "",
    meaning: insights.meaning || "",
    synonyms: insights.synonyms || [],
    usages: insights.usages || [],
    characters: decomp.characters || [],
    combinedStory: decomp.combinedStory || "",
    fromCache: false,
  };

  // 3. Lưu lại vào bảng WordAnalysis trong MongoDB để lần sau mở lại 0 tốn token
  if (merged.characters.length > 0 || merged.usages.length > 0 || merged.synonyms.length > 0) {
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
