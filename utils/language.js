/**
 * Danh sách từ khóa tiếng Anh phổ biến để phân biệt với tiếng Việt không dấu
 * Đưa ra ngoài hàm để tránh việc khởi tạo lại mảng mỗi khi gọi hàm detect
 */
const EN_KEYWORDS = [
  "hello",
  "hi",
  "hey",
  "good",
  "morning",
  "afternoon",
  "evening",
  "bye",
  "goodbye",
  "i",
  "you",
  "we",
  "they",
  "he",
  "she",
  "it",
  "is",
  "am",
  "are",
  "was",
  "were",
  "how",
  "what",
  "where",
  "when",
  "why",
  "who",
  "which",
  "do",
  "does",
  "did",
  "vocabulary",
  "grammar",
  "noun",
  "verb",
  "adjective",
  "adverb",
  "sentence",
  "phrase",
  "example",
  "pronunciation",
  "ipa",
  "meaning",
  "lesson",
  "unit",
  "thank",
  "thanks",
  "sorry",
  "please",
  "yes",
  "no",
  "ok",
  "okay",
  "fine",
  "great",
  "one",
  "two",
  "three",
  "love",
  "like",
  "hate",
  "want",
  "need",
  "can",
  "will",
];

/**
 * Nhận diện ngôn ngữ dựa trên Regex và từ khóa
 * Ưu tiên: Nhật -> Việt (có dấu) -> Anh -> Việt (không dấu)
 */
export function detectLanguage(text) {
  if (!text) return "vi";
  const clean = text.trim();

  // 1. Kiểm tra tiếng Nhật (Hiragana, Katakana, Kanji)
  if (/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(clean)) {
    return "ja";
  }

  // 2. Kiểm tra tiếng Việt có dấu
  const viRegex =
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  if (viRegex.test(clean)) {
    return "vi";
  }

  // 3. Phân biệt Anh vs Việt không dấu
  const lower = clean.toLowerCase();

  // Kiểm tra từ khóa tiếng Anh
  const hasEnglishKeyword = EN_KEYWORDS.some((keyword) => {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    return regex.test(lower);
  });

  if (hasEnglishKeyword) return "en";

  // Kiểm tra ký tự phiên âm quốc tế (IPA) - Hữu ích khi AI giải thích phát âm
  if (/[ːʃʒθðŋæəɪʊʌɔɛ]/.test(clean)) return "en";

  // Kiểm tra tỷ lệ từ tiếng Anh trong câu dài
  const words = lower.split(/\s+/);
  if (words.length > 3) {
    const enCount = words.filter((w) =>
      EN_KEYWORDS.includes(w.replace(/[^a-z]/g, "")),
    ).length;
    if (enCount / words.length > 0.5) return "en";
  }

  // Mặc định trả về tiếng Việt (Dành cho các câu không dấu)
  return "vi";
}
