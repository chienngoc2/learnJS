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

export async function decomposeWordWithRadicals(
  rawWord: string,
  forceRefresh = false
): Promise<WordDecompositionResult> {
  const word = (rawWord || "").trim();
  if (!word) {
    return { word: "", characters: [], combinedStory: "" };
  }

  if (forceRefresh) {
    runtimeDecomposeCache.delete(word);
  } else if (runtimeDecomposeCache.has(word)) {
    return runtimeDecomposeCache.get(word)!;
  }

  const chars = Array.from(new Set(Array.from(word).filter(isChineseChar)));
  if (chars.length === 0) {
    return { word, characters: [], combinedStory: "" };
  }

  // 1. Kiểm tra cache trong MongoDB collection Kanji (bỏ qua nếu forceRefresh)
  const existingDocs = await Kanji.find({ character: { $in: chars } }).lean();
  const docMap = new Map<string, any>();
  if (!forceRefresh) {
    for (const d of existingDocs) {
      if (d.character && Array.isArray(d.components) && d.components.length > 0 && d.story) {
        docMap.set(d.character, d);
      }
    }
  }

  const missingChars = chars.filter((c) => !docMap.has(c));

  // 2. Nếu có chữ chưa có phân tích bộ thủ hoặc yêu cầu phân tích lại -> gọi Gemini
  if (missingChars.length > 0) {
    const prompt = `
Bạn là chuyên gia văn tự học & chiết tự chữ Hán Phồn Thể (繁體中文 - Đài Loan) theo chuẩn 214 Bộ Thủ Khang Hy.
Hãy phân tích CHÍNH XÁC từng chữ Hán trong danh sách sau: [${missingChars.join(", ")}] (trong từ "${word}").

QUY TẮC BẮT BUỘC (TUYỆT ĐỐI TUÂN THỦ):
1. KHÔNG BAO GIỜ BỊA THÊM BỘ THỦ HAY NÉT KHÔNG TỒN TẠI TRÊN MẶT CHỮ:
   - Mọi thành phần liệt kê phải thực sự hiện diện trên chữ Hán đó và khớp cấu tạo nét Khải thư.
   - Ví dụ CẤM SAI: chữ "革" (9 nét) chỉ là 1 bộ thủ gốc #177 (Cách - da thuộc), hoặc nhìn theo nét là 廿 + 口 + 十 — TUYỆT ĐỐI KHÔNG được bịa thêm "木" hay nét lạ.
2. TÁCH KỸ ĐẾN TẬN BỘ THỦ KHANG HY GỐC (KHÔNG DỪNG NỬA CHỪNG):
   - Nếu chữ có thành phần ghép trung gian vẫn còn tách được tiếp thành bộ thủ trong 214 bộ Khang Hy, PHẢI tách sâu ra từng bộ gốc theo đúng thứ tự trái->phải / trên->dưới / ngoài->trong.
   - Ví dụ chuẩn:
     * "鞋" ❌ KHÔNG dừng ở [革, 圭] -> PHẢI tách kỹ thành: ["革" (Cách - da thuộc), "土" (Thổ - đất), "土" (Thổ - đất)] vì "圭" gồm 2 bộ 土 chồng lên nhau!
     * "休" -> ["亻" (Nhân - người), "木" (Mộc - cây)]
     * "好" -> ["女" (Nữ - phụ nữ), "子" (Tử - con)]
     * "林" -> ["木" (Mộc), "木" (Mộc)]
     * "明" -> ["日" (Nhật - mặt trời), "月" (Nguyệt - mặt trăng)]
3. CHỮ TỰ THÂN LÀ 1 TRONG 214 BỘ THỦ GỐC (như 革, 人, 木, 水, 火, 土, 日, 月, 口, 心, 手, 金, 馬, 雨...):
   - Không cần ép tách ra 2-5 mảnh giả tạo nếu tự thân là bộ thủ gốc 1 khối! Có thể trả về chính bộ thủ gốc đó (1 phần tử) rồi mô tả rõ hình dáng từng nét/cụm nét trong phần "story".
4. Với mỗi bộ thủ, ghi rõ: "radical" (ký tự bộ thủ chuẩn), "hanViet" (Hán Việt), "pinyin", "meaning" (nghĩa tiếng Việt ngắn gọn, rõ).
5. Viết "story": Giải thích rõ cấu trúc vị trí (trái/phải/trên/dưới), ý nghĩa gốc hoặc câu chuyện logic sâu sắc gắn liền các bộ thủ thực tế để người học nhớ mặt chữ lẫn cách viết.

Trả về JSON thuần theo schema:
{
  "characters": [
    {
      "char": "鞋",
      "pinyin": "xié",
      "hanViet": "Hài",
      "meaning": "Giày, dép",
      "radicals": [
        { "radical": "革", "hanViet": "Cách", "pinyin": "gé", "meaning": "Da thuộc" },
        { "radical": "土", "hanViet": "Thổ", "pinyin": "tǔ", "meaning": "Đất" },
        { "radical": "土", "hanViet": "Thổ", "pinyin": "tǔ", "meaning": "Đất" }
      ],
      "story": "Bên trái là bộ Cách (革 - da thuộc), bên phải là hai bộ Thổ (土) chồng lên nhau thành Khuê (圭): đôi giày (鞋) làm bằng da (革) bền chắc để bước đi trên mặt đất (土)."
    }
  ],
  "combinedStory": "Câu chuyện liên kết tự nhiên cả từ '${word}' (nếu có nhiều chữ)."
}
Chỉ trả về JSON hợp lệ.
`;

    try {
      const text = await withGeminiRotation(async (client) => {
        const models = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-flash-latest"];
        let lastErr: any;
        for (const m of models) {
          try {
            const model = client.getGenerativeModel({
              model: m,
              generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.1,
              },
            });
            const res = await Promise.race([
              model.generateContent(prompt),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout 12s on ${m}`)), 12000)
              ),
            ]);
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

        // Lưu hoặc ghi đè cache Kanji nếu forceRefresh
        try {
          const existing = await Kanji.findOne({ character: item.char });
          if (existing) {
            let dirty = false;
            if (forceRefresh || !existing.components || existing.components.length === 0) {
              existing.components = radList.map((r) => r.radical);
              dirty = true;
            }
            if ((forceRefresh || !existing.story) && item.story) {
              existing.story = item.story;
              dirty = true;
            }
            if (dirty) await existing.save();
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
