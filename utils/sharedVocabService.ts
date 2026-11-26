import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import SharedVocab from "../models/SharedVocab.js";
import VocabList from "../models/VocabList.js";
import ReadingPassage from "../models/ReadingPassage.js";
import WordAnalysis from "../models/WordAnalysis.js";
import Kanji from "../models/Kanji.js";
import { cleanPinyinForMatching } from "./pinyinUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SearchableWordItem {
  word: string;
  pinyin: string;
  cleanPinyin: string;
  hanviet: string;
  meaning: string;
  cleanMeaning: string;
  level: string;
  source?: string;
}

export interface UpsertVocabInput {
  word: string;
  pinyin?: string;
  hanviet?: string;
  meaning?: string;
  pos?: string;
  level?: string;
}

let cachedMasterWords: any[] | null = null;
export function getMasterWordsList(): any[] {
  if (cachedMasterWords) return cachedMasterWords;
  try {
    const p = path.join(__dirname, "../data/vocab_master.json");
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, "utf-8"));
      cachedMasterWords = data.words || data || [];
      return cachedMasterWords || [];
    }
  } catch (e) {
    console.warn("Could not load master vocab:", e);
  }
  return [];
}

/**
 * Chuẩn hóa chuỗi tiếng Việt (bỏ dấu thanh, đ -> d, chữ thường) để tìm kiếm không dấu chính xác
 */
export function normalizeViForSearch(str: string): string {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function escapeRegex(str: string): string {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseWordDef(rawTerm: string, rawDef: string, rawPinyin?: string, rawMeaning?: string) {
  let meaning = rawMeaning || rawDef || "";
  let pinyin = rawPinyin || "";
  let hanviet = "";

  if (typeof meaning === "string" && meaning.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(meaning);
      meaning = parsed.meaning || parsed.def || meaning;
      pinyin = pinyin || parsed.pinyin || parsed.reading || "";
      hanviet = parsed.hanviet || "";
    } catch {}
  }

  return {
    word: String(rawTerm || "").trim(),
    pinyin: String(pinyin || "").trim(),
    hanviet: String(hanviet || "").trim(),
    meaning: String(meaning || "").trim(),
  };
}

/**
 * Tự động thêm/gộp bất kỳ từ mới nào xuất hiện trong bài đọc, bài học hoặc phân tích AI
 * vào collection SharedVocab để có thể tra cứu mọi lúc.
 */
export async function upsertSharedVocabBatch(
  items: UpsertVocabInput[],
  sourceTitle = "Bài học"
): Promise<void> {
  if (!Array.isArray(items) || items.length === 0) return;

  const deduped = new Map<string, UpsertVocabInput>();
  for (const item of items) {
    const cleanWord = String(item?.word || "").trim();
    if (!cleanWord) continue;
    const prev = deduped.get(cleanWord);
    deduped.set(cleanWord, {
      word: cleanWord,
      pinyin: (item.pinyin || prev?.pinyin || "").trim(),
      hanviet: (item.hanviet || prev?.hanviet || "").trim(),
      meaning: (item.meaning || prev?.meaning || "").trim(),
      pos: (item.pos || prev?.pos || "").trim(),
      level: (item.level || prev?.level || sourceTitle || "Bài học").trim(),
    });
  }

  if (deduped.size === 0) return;

  const ops = Array.from(deduped.values()).map((item) => {
    const pinyin = item.pinyin || "";
    const meaning = item.meaning || "";
    const setFields: Record<string, any> = {};
    if (pinyin) {
      setFields.pinyin = pinyin;
      setFields.cleanPinyin = cleanPinyinForMatching(pinyin);
    }
    if (item.hanviet) setFields.hanviet = item.hanviet;
    if (meaning) {
      setFields.meaning = meaning;
      setFields.cleanMeaning = normalizeViForSearch(meaning);
    }
    if (item.pos) setFields.pos = item.pos;
    if (item.level) setFields.level = item.level;

    const cleanSource = String(sourceTitle || "Bài học").trim();
    return {
      updateOne: {
        filter: { word: item.word },
        update: {
          $setOnInsert: { word: item.word },
          ...(Object.keys(setFields).length > 0 ? { $set: setFields } : {}),
          ...(cleanSource ? { $addToSet: { sources: cleanSource } } : {}),
        },
        upsert: true,
      },
    };
  });

  try {
    await SharedVocab.bulkWrite(ops, { ordered: false });
  } catch (err: any) {
    console.warn("⚠️ [SharedVocab] bulkWrite warning:", err?.message);
  }
}

/**
 * Tổng hợp kho từ vựng tra cứu hợp nhất từ SharedVocab, VocabList, ReadingPassage,
 * WordAnalysis, Kanji và kho Master JSON.
 */
export async function collectCombinedVocabPool(): Promise<SearchableWordItem[]> {
  const [sharedDocs, vocabLists, readingDocs, analysisDocs, kanjiDocs] = await Promise.all([
    SharedVocab.find({}).select("word pinyin cleanPinyin hanviet meaning cleanMeaning level sources").lean(),
    VocabList.find({}).select("title words").lean(),
    ReadingPassage.find({}).select("title vocabulary").lean(),
    WordAnalysis.find({}).select("word pinyin hanviet meaning").lean(),
    Kanji.find({}).select("character meaning pinyin vietnamese_reading level lessonGroup example_words").lean(),
  ]);

  const map = new Map<string, SearchableWordItem>();

  const mergeEntry = (raw: {
    word: string;
    pinyin?: string;
    hanviet?: string;
    meaning?: string;
    level?: string;
    source?: string;
  }) => {
    const w = String(raw.word || "").trim();
    if (!w) return;

    const existing = map.get(w);
    const pinyin = String(raw.pinyin || existing?.pinyin || "").trim();
    const hanviet = String(raw.hanviet || existing?.hanviet || "").trim();
    const meaning = String(raw.meaning || existing?.meaning || "").trim();
    const level = String(existing?.level || raw.level || "Bài học").trim();
    const source = existing?.source || raw.source || level;

    map.set(w, {
      word: w,
      pinyin,
      cleanPinyin: cleanPinyinForMatching(pinyin),
      hanviet,
      meaning,
      cleanMeaning: normalizeViForSearch(meaning),
      level,
      source,
    });
  };

  // 1. WordAnalysis & SharedVocab (giàu nghĩa + pinyin + Hán Việt nhất)
  for (const a of analysisDocs as any[]) {
    mergeEntry({
      word: a.word,
      pinyin: a.pinyin,
      hanviet: a.hanviet,
      meaning: a.meaning,
      level: "AI Phân tích",
    });
  }

  for (const s of sharedDocs as any[]) {
    mergeEntry({
      word: s.word,
      pinyin: s.pinyin,
      hanviet: s.hanviet,
      meaning: s.meaning,
      level: s.level || (Array.isArray(s.sources) && s.sources[0]) || "Kho chung",
      source: Array.isArray(s.sources) ? s.sources[0] : undefined,
    });
  }

  // 2. ReadingPassage vocabulary (mọi từ mới từng xuất hiện trong bài đọc)
  for (const r of readingDocs as any[]) {
    const title = r.title ? `Bài đọc: ${r.title}` : "Bài đọc";
    for (const v of r.vocabulary || []) {
      if (v?.term) {
        mergeEntry({
          word: v.term,
          pinyin: v.pinyin,
          meaning: v.meaning,
          level: title,
          source: title,
        });
      }
    }
  }

  // 3. VocabList (tất cả bài học từ vựng)
  for (const list of vocabLists as any[]) {
    for (const w of list.words || []) {
      const parsed = parseWordDef(w.term, w.def, w.pinyin || w.reading, w.meaning);
      if (parsed.word) {
        mergeEntry({
          word: parsed.word,
          pinyin: parsed.pinyin,
          hanviet: parsed.hanviet,
          meaning: parsed.meaning,
          level: list.title || w.level || "Bài học",
          source: list.title,
        });
      }
    }
  }

  // 4. Kanji & từ ghép mẫu
  for (const k of kanjiDocs as any[]) {
    if (k.character) {
      mergeEntry({
        word: k.character,
        pinyin: k.pinyin,
        hanviet: k.vietnamese_reading,
        meaning: k.meaning || k.vietnamese_reading,
        level: k.lessonGroup || k.level || "Kanji",
        source: k.lessonGroup || k.level,
      });
    }
    for (const ew of k.example_words || []) {
      if (ew?.word) {
        mergeEntry({
          word: ew.word,
          pinyin: ew.reading,
          meaning: ew.meaning,
          level: k.lessonGroup || k.level || "Kanji",
          source: k.lessonGroup || k.level,
        });
      }
    }
  }

  // 5. Kho Master JSON (bổ sung phần còn thiếu)
  for (const m of getMasterWordsList()) {
    if (m?.word) {
      mergeEntry({
        word: m.word,
        pinyin: m.pinyin,
        meaning: m.meaning,
        level: m.level || "TOCFL A1",
        source: "Master",
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Chấm điểm độ khớp khi tra cứu theo chữ Hán, Pinyin (có/không dấu), Hán Việt hoặc nghĩa tiếng Việt (có/không dấu)
 */
export function scoreSearchMatch(item: SearchableWordItem, rawQuery: string): number {
  const q = String(rawQuery || "").trim();
  if (!q) return 0;

  const qLower = q.toLowerCase();
  const qVi = normalizeViForSearch(q);
  const qPinyin = cleanPinyinForMatching(q);
  const hasHanzi = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(q);
  const hasSpaces = /\s/.test(q);

  const wLower = item.word.toLowerCase();
  const pClean = item.cleanPinyin || cleanPinyinForMatching(item.pinyin);
  const mVi = item.cleanMeaning || normalizeViForSearch(item.meaning);
  const hvVi = normalizeViForSearch(item.hanviet);

  if (item.word === q || wLower === qLower) return 1000;
  if (hvVi && qVi && hvVi === qVi) return 860;
  if (pClean && qPinyin && !hasHanzi && pClean === qPinyin) return 820;

  // Khớp chính xác theo từng cụm nghĩa (tách bằng dấu phẩy / chấm phẩy)
  if (mVi && qVi) {
    const segments = mVi.split(/[,;/]+/).map((s) => s.trim()).filter(Boolean);
    if (mVi === qVi || segments.includes(qVi)) return 780;
  }

  if (wLower.startsWith(qLower)) return 650;
  if (wLower.includes(qLower)) return 550;

  if (pClean && qPinyin && !hasHanzi && !hasSpaces) {
    if (pClean.startsWith(qPinyin)) return 460;
    if (qPinyin.length >= 2 && pClean.includes(qPinyin)) return 360;
  }

  if (mVi && qVi) {
    if (mVi.startsWith(qVi)) return 420;
    const wordBoundary = new RegExp(`(^|\\s|[,;/()])${escapeRegex(qVi)}(\\s|[,;/()]|$)`);
    if (wordBoundary.test(mVi)) return 340;
    if (qVi.length >= 2 && mVi.includes(qVi)) return 240;
  }

  if (hvVi && qVi && qVi.length >= 2 && hvVi.includes(qVi)) return 220;

  return 0;
}
