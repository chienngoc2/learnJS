import Kanji from "../models/Kanji.js";
import { RADICALS_214, RADICAL_PALETTE, findRadicalByChar } from "../data/radicals214.js";
import { withGeminiRotation } from "./geminiClient.js";

export interface DecomposedRadical {
  radical: string;
  radicalId?: number;
  hanViet: string;
  pinyin: string;
  meaning: string;
  color: string;
}

export interface CharacterDecomposition {
  char: string;
  pinyin: string;
  hanViet: string;
  meaning: string;
  radicals: DecomposedRadical[];
  story: string;
}

export interface WordDecompositionResult {
  word: string;
  characters: CharacterDecomposition[];
  combinedStory: string;
}

const runtimeDecomposeCache = new Map<string, WordDecompositionResult>();

function isChineseChar(ch: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch);
}

function attachRadicalColors(rawRadicals: any[]): DecomposedRadical[] {
  return (rawRadicals || []).map((r: any, idx: number) => {
    const radChar = typeof r === "string" ? r.trim() : String(r?.radical || "").trim();
    const matched = findRadicalByChar(radChar);
    return {
      radical: radChar || matched?.radical || "?",
      radicalId: matched?.id,
      hanViet: (typeof r === "object" && r?.hanViet) || matched?.hanViet || "",
      pinyin: (typeof r === "object" && r?.pinyin) || matched?.pinyin || "",
      meaning: (typeof r === "object" && r?.meaning) || matched?.meaning || "",
      color: RADICAL_PALETTE[idx % RADICAL_PALETTE.length],
    };
  });
}

export async function decomposeWordWithRadicals(rawWord: string): Promise<WordDecompositionResult> {
  const word = (rawWord || "").trim();
  if (!word) {
    return { word: "", characters: [], combinedStory: "" };
  }

  if (runtimeDecomposeCache.has(word)) {
    return runtimeDecomposeCache.get(word)!;
  }

  const chars = Array.from(new Set(Array.from(word).filter(isChineseChar)));
  if (chars.length === 0) {
    return { word, characters: [], combinedStory: "" };
  }

  // 1. Kiểm tra cache trong MongoDB collection Kanji
  const existingDocs = await Kanji.find({ character: { $in: chars } }).lean();
  const docMap = new Map<string, any>();
  for (const d of existingDocs) {
    if (d.character && Array.isArray(d.components) && d.components.length > 0 && d.story) {
      docMap.set(d.character, d);
    }
  }

  const missingChars = chars.filter((c) => !docMap.has(c));

  // 2. Nếu có chữ chưa có phân tích bộ thủ hoặc câu chuyện -> gọi Gemini (tự xoay khóa)
  if (missingChars.length > 0) {
    const prompt = `
Bạn là chuyên gia chiết tự chữ Hán Phồn Thể theo chuẩn 214 Bộ Thủ Khang Hy.
Hãy phân tích từng chữ Hán trong danh sách sau: [${missingChars.join(", ")}] (trong từ vựng "${word}").

YÊU CẦU VỚI MỖI CHỮ HÁN:
1. Tách chữ đó thành 2-5 bộ thủ / thành phần cấu thành theo 214 bộ thủ Khang Hy (ví dụ: 休 -> 亻 (Nhân - người), 木 (Mộc - cây); 好 -> 女 (Nữ - phụ nữ), 子 (Tử - con cái)).
2. Với mỗi bộ thủ, ghi rõ: "radical" (ký tự bộ thủ), "hanViet" (tên Hán Việt), "pinyin", "meaning" (nghĩa tiếng Việt ngắn gọn).
3. Viết "story": Một câu chuyện ngắn gọn, sinh động, hài hước hoặc giàu hình ảnh bằng tiếng Việt **nối liền các bộ thủ đó lại với nhau** để người học nhớ ngay mặt chữ và nghĩa của chữ!
4. Cung cấp thêm "pinyin", "hanViet", "meaning" của chữ Hán đó.

Trả về JSON thuần theo schema:
{
  "characters": [
    {
      "char": "好",
      "pinyin": "hǎo",
      "hanViet": "Hảo",
      "meaning": "Tốt, đẹp",
      "radicals": [
        { "radical": "女", "hanViet": "Nữ", "pinyin": "nǚ", "meaning": "Phụ nữ" },
        { "radical": "子", "hanViet": "Tử", "pinyin": "zǐ", "meaning": "Con cái" }
      ],
      "story": "Người phụ nữ (女) ôm đứa con nhỏ (子) trong vòng tay là điều tốt đẹp (好) nhất trên đời."
    }
  ],
  "combinedStory": "Câu chuyện ngắn kết nối cả từ '${word}' nếu là từ ghép nhiều chữ."
}
Chỉ trả về JSON hợp lệ.
`;

    try {
      const text = await withGeminiRotation(async (client) => {
        const models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"];
        let lastErr: any;
        for (const m of models) {
          try {
            const model = client.getGenerativeModel({
              model: m,
              generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.3,
              },
            });
            const res = await model.generateContent(prompt);
            const out = res.response.text();
            if (out) return out;
          } catch (e: any) {
            lastErr = e;
            // Nếu là lỗi 429/quota, ném ra ngoài để withGeminiRotation xoay sang key khác
            if (String(e?.message || "").includes("429") || String(e?.message || "").toLowerCase().includes("quota")) {
              throw e;
            }
          }
        }
        throw lastErr || new Error("Không thể phân tích bộ thủ");
      });

      const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      const aiChars = Array.isArray(parsed.characters) ? parsed.characters : [];

      for (const item of aiChars) {
        if (!item?.char) continue;
        const radList = attachRadicalColors(item.radicals || []);
        docMap.set(item.char, {
          character: item.char,
          pinyin: item.pinyin || "",
          hanViet: item.hanViet || "",
          meaning: item.meaning || "",
          radicals: radList.map((r) => r.radical),
          radicalsDetailed: radList,
          story: item.story || "",
        });

        // Lưu cache vào MongoDB nếu chữ đã tồn tại hoặc tạo nhẹ nếu chưa có
        try {
          const existing = await Kanji.findOne({ character: item.char });
          if (existing) {
            if (!existing.components || existing.components.length === 0) {
              existing.components = radList.map((r) => r.radical);
            }
            if (!existing.story && item.story) {
              existing.story = item.story;
            }
            await existing.save();
          }
        } catch (dbErr) {}
      }

      const characters: CharacterDecomposition[] = Array.from(word)
        .filter(isChineseChar)
        .map((c) => {
          const info = docMap.get(c);
          if (!info) {
            const selfRad = findRadicalByChar(c);
            return {
              char: c,
              pinyin: "",
              hanViet: selfRad?.hanViet || "",
              meaning: selfRad?.meaning || "",
              radicals: selfRad
                ? [
                    {
                      radical: selfRad.radical,
                      radicalId: selfRad.id,
                      hanViet: selfRad.hanViet,
                      pinyin: selfRad.pinyin,
                      meaning: selfRad.meaning,
                      color: RADICAL_PALETTE[0],
                    },
                  ]
                : [],
              story: "",
            };
          }
          const detailed = info.radicalsDetailed || attachRadicalColors(info.radicals || []);
          return {
            char: c,
            pinyin: info.pinyin || "",
            hanViet: info.hanViet || "",
            meaning: info.meaning || "",
            radicals: detailed,
            story: info.story || "",
          };
        });

      const result: WordDecompositionResult = {
        word,
        characters,
        combinedStory: parsed.combinedStory || characters.map((ch) => ch.story).filter(Boolean).join(" "),
      };
      runtimeDecomposeCache.set(word, result);
      return result;
    } catch (err: any) {
      console.warn("⚠️ [RadicalDecomposer] Lỗi AI:", err.message);
    }
  }

  // Trường hợp tất cả các chữ đã có sẵn trong DB hoặc AI lỗi -> trả từ DB + bảng 214 bộ thủ
  const characters: CharacterDecomposition[] = Array.from(word)
    .filter(isChineseChar)
    .map((c) => {
      const info = docMap.get(c);
      const selfRad = findRadicalByChar(c);
      const detailed = info?.components?.length
        ? attachRadicalColors(info.components)
        : info?.radicals?.length
          ? attachRadicalColors(info.radicals)
          : selfRad
          ? [
              {
                radical: selfRad.radical,
                radicalId: selfRad.id,
                hanViet: selfRad.hanViet,
                pinyin: selfRad.pinyin,
                meaning: selfRad.meaning,
                color: RADICAL_PALETTE[0],
              },
            ]
          : [];
      return {
        char: c,
        pinyin: info?.pinyin || "",
        hanViet: info?.vietnamese_reading || info?.hanViet || selfRad?.hanViet || "",
        meaning: info?.meaning || selfRad?.meaning || "",
        radicals: detailed,
        story: info?.story || "",
      };
    });

  const result: WordDecompositionResult = {
    word,
    characters,
    combinedStory: characters.map((ch) => ch.story).filter(Boolean).join(" "),
  };
  runtimeDecomposeCache.set(word, result);
  return result;
}

export function getAll214Radicals() {
  return RADICALS_214;
}
