import "dotenv/config";
import * as googleTTS from "google-tts-api";
import { detectLanguage } from "./language.js"; 

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

/**
 * Dọn dẹp text để TTS đọc không bị vấp hoặc đọc nhầm các ký tự đặc biệt
 */
export function cleanTextForTTS(text) {
  if (!text || typeof text !== "string") return "";
  let clean = text;

  clean = clean.replace(/[\u201C\u201D\u201E\u2033\u2036]/g, '"'); // Chuẩn hóa dấu ngoặc
  clean = clean.replace(/\/\s*[\u3040-\u309f\u30a0-\u30ff]+/g, ""); // Xóa phần phiên âm sau dấu gạch chéo
  clean = clean.replace(/\(.*?\)|（.*?）|\[.*?\]/g, ""); // Xóa nội dung trong ngoặc
  clean = clean.replace(/\/.*?\//g, "");
  clean = clean.replace(/[\*_`"!.~#@$%^&+=|<>]/g, ""); // Xóa ký tự định dạng
  clean = clean.replace(/\n+/g, ". "); // Đổi xuống dòng thành dấu chấm để nghỉ hơi
  clean = clean.replace(/\s+/g, " ");

  return clean.trim();
}

/**
 * Hàm chính tạo mảng audio base64 từ văn bản
 */
export async function generateSmartAudio(
  fullText,
  engine,
  userSelectedVoiceId,
) {
  const cleanGlobal = cleanTextForTTS(fullText);
  if (!cleanGlobal || cleanGlobal.length < 1) return [];

  // Ưu tiên ElevenLabs nếu sếp có cấu hình (dành cho giọng cao cấp)
  if (engine === "elevenlabs" && ELEVENLABS_API_KEY) {
    // Sếp có thể copy logic ElevenLabs cũ vào đây nếu cần
    console.log("🔸 ElevenLabs Engine selected (Coming soon...)");
  }

  console.log("🔹 Google TTS Processing...");

  // Logic tách câu: Tách các đoạn tiếng Nhật và các đoạn nằm trong ngoặc kép
  const regexSplit =
    /([\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+|"[^"]+")/g;
  const rawParts = cleanGlobal.split(regexSplit);
  const results = [];

  for (let part of rawParts) {
    let segment = part.trim();
    if (!segment) continue;

    const textToDetect = segment.replace(/^"|"$/g, ""); // Bỏ dấu ngoặc kép khi nhận diện ngôn ngữ
    if (!textToDetect) continue;

    let lang = detectLanguage(textToDetect); // Gọi hàm nhận diện Nhật/Việt
    const safeText = textToDetect.replace(/[:;\-]/g, ", "); // Đổi ký tự ngắt quãng thành dấu phẩy

    try {
      // Google TTS giới hạn 200 ký tự mỗi đoạn, getAllAudioBase64 sẽ tự động chia nhỏ
      const googleResults = await googleTTS.getAllAudioBase64(safeText, {
        lang: lang,
        slow: false,
        host: "https://translate.google.com.vn",
        timeout: 10000,
      });

      googleResults.forEach((item) =>
        results.push(`data:audio/mp3;base64,${item.base64}`),
      );
    } catch (e) {
      console.error(`❌ TTS Error (${lang}):`, e.message);
    }
  }

  return results;
}

