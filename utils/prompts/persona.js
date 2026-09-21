import { friendPrompt } from "./friend.js";
import { chinesePrompt } from "./chinese.js";
import { englishPrompt } from "./english.js";
import { kanjiPrompt } from "./kanji.js";

/**
 * Hàm tự động chọn Persona dựa trên nội dung tin nhắn của sếp
 */
export function selectPersona(userText) {
  const text = userText.toLowerCase();

  // Mặc định ban đầu là một người bạn thân thiết, vui vẻ
  let selectedSystemPrompt = friendPrompt;

  // 1. Kiểm tra nếu có chữ Hán/tiếng Trung hoặc nhắc đến việc học tiếng Trung
  const hasChinese = /[\u4e00-\u9fff\u3400-\u4dbf\u3100-\u312f]/.test(text);
  if (text.includes("trung") || text.includes("phồn thể") || text.includes("hán tự") || text.includes("tocfl") || text.includes("hsk") || hasChinese) {
    console.log("👉 [Persona]: CHINESE LAOSHI Mode");

    selectedSystemPrompt +=
      "\n\n[INSTRUCTION]: Bạn đang trong vai Lão sư (老師) dạy Tiếng Trung Phồn Thể. " +
      chinesePrompt;

    // Nếu có dạy Chữ Hán thì nạp thêm logic phân tích hán tự
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
