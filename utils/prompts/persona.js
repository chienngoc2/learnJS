import { friendPrompt } from "./friend.js";
import { japanesePrompt } from "./japanese.js";
import { englishPrompt } from "./english.js";
import { kanjiPrompt } from "./kanji.js";

/**
 * Hàm tự động chọn Persona dựa trên nội dung tin nhắn của sếp
 */
export function selectPersona(userText) {
  const text = userText.toLowerCase();

  // Mặc định ban đầu là một người bạn thân thiết, vui vẻ
  let selectedSystemPrompt = friendPrompt;

  // 1. Kiểm tra nếu có tiếng Nhật hoặc nhắc đến việc học tiếng Nhật
  const hasJapanese =
    /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(text);
  if (text.includes("nhật") || text.includes("minna") || hasJapanese) {
    console.log("👉 [Persona]: JAPANESE SENSEI Mode");

    selectedSystemPrompt +=
      "\n\n[INSTRUCTION]: Bạn đang trong vai Sensei dạy tiếng Nhật. " +
      japanesePrompt;

    // Nếu có dạy Kanji thì nạp thêm logic phân tích hán tự
    if (typeof kanjiPrompt !== "undefined") {
      selectedSystemPrompt += "\n" + kanjiPrompt;
    }
    return selectedSystemPrompt;
  }

  // 2. Kiểm tra nếu sếp muốn luyện tiếng Anh (IELTS 6.5-7.0 như mục tiêu của sếp)
  const isEnglishMode =
    text.includes("nói tiếng anh") ||
    text.includes("speak english") ||
    text.includes("vocabulary") ||
    text.includes("ielts");

  if (isEnglishMode) {
    console.log("👉 [Persona]: ENGLISH PROFESSOR Mode");
    return (
      friendPrompt +
      "\n\n[INSTRUCTION]: Bạn là một chuyên gia ngôn ngữ Anh. " +
      englishPrompt
    );
  }

  // 3. Mặc định: Trợ lý cá nhân thân thiện (Tiếng Việt)
  console.log("👉 [Persona]: FRIENDLY ASSISTANT Mode");
  return friendPrompt;
}
