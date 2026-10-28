import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  startFormatted: string;
  endFormatted: string;
  text: string;
  pinyin?: string;
  meaningVi: string;
}

export interface TranscriptionResult {
  fullText: string;
  fullTranslation?: string;
  duration: number;
  segments: TranscriptionSegment[];
  language: string;
}

// Hàm format giây thành mm:ss hoặc hh:mm:ss
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const mm = m < 10 ? `0${m}` : `${m}`;
  const ss = s < 10 ? `0${s}` : `${s}`;

  if (h > 0) {
    const hh = h < 10 ? `0${h}` : `${h}`;
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Xác định MIME Type thích hợp dựa trên phần mở rộng file
 */
function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".mp3":
      return "audio/mp3";
    case ".wav":
      return "audio/wav";
    case ".m4a":
      return "audio/m4a";
    case ".aac":
      return "audio/aac";
    case ".ogg":
      return "audio/ogg";
    case ".flac":
      return "audio/flac";
    case ".webm":
      return "audio/webm";
    default:
      return "audio/mp3";
  }
}

/**
 * Trích xuất Script hoàn chỉnh từ file âm thanh sử dụng Google Gemini Flash (Miễn phí 100%, 0 Groq)
 * Tối ưu hóa tuyệt đối cho Vercel Serverless (không cài thêm binary nặng)
 */
export async function transcribeAudioBuffer(
  audioBuffer: Buffer,
  fileName: string = "audio.mp3",
  language: string = "chinese"
): Promise<TranscriptionResult> {
  const mimeType = getMimeType(fileName);
  console.log(`🎙️ [Gemini Audio Transcribe] Đang xử lý file: ${fileName} (${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB, MIME: ${mimeType})`);

  const prompt = `
Bạn là chuyên gia phiên âm và biên soạn giáo trình tiếng Trung (ưu tiên Phồn Thể - 繁體中文, TOCFL) kiêm dịch giả Trung - Việt.
Nhiệm vụ của bạn:
1. Hãy nghe kỹ file âm thanh đính kèm và trích xuất TOÀN BỘ kịch bản (transcript) chính xác từng từ bằng chữ Hán Phồn Thể (Traditional Chinese).
2. Tách kịch bản thành từng phân đoạn/câu nói tự nhiên tương ứng với mốc thời gian (timestamp) bắt đầu và kết thúc của câu đó trong file âm thanh.
3. Với MỖI phân đoạn/câu, BẮT BUỘC cung cấp:
   - "text": Câu tiếng Trung Phồn Thể (繁體中文).
   - "pinyin": Phiên âm Bính Âm có dấu thanh điệu chuẩn quốc tế.
   - "meaningVi": Bản dịch nghĩa tiếng Việt chuẩn xác, tự nhiên, sát ngữ cảnh của câu đó.
4. "fullText": Toàn bộ văn bản tiếng Trung Phồn Thể.
5. "fullTranslation": Toàn bộ bản dịch tiếng Việt của bài.
6. Ước tính tổng thời lượng audio (đơn vị: giây).

BẮT BUỘC trả về định dạng JSON thuần theo schema sau:
{
  "fullText": "Toàn bộ văn bản tiếng Trung Phồn Thể liền mạch",
  "fullTranslation": "Toàn bộ bản dịch nghĩa tiếng Việt",
  "duration": 35.5,
  "segments": [
    {
      "id": 0,
      "start": 0.0,
      "end": 3.5,
      "text": "你好，歡迎收聽中文廣播。",
      "pinyin": "nǐ hǎo, huān yíng shōu tīng zhōng wén guǎng bō.",
      "meaningVi": "Xin chào, chào mừng các bạn đón nghe đài phát thanh tiếng Trung."
    }
  ]
}
Chỉ trả về JSON hợp lệ, không thêm bất kỳ văn bản markdown hay giải thích nào ngoài JSON.
`;

  const audioPart = {
    inlineData: {
      data: audioBuffer.toString("base64"),
      mimeType: mimeType,
    },
  };

  const CANDIDATE_MODELS = [
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-flash-latest",
  ];

  let lastError: any = null;
  let responseText = "";

  for (const modelName of CANDIDATE_MODELS) {
    try {
      console.log(`🎙️ [Gemini Audio Transcribe] Thử model: ${modelName}...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const response = await model.generateContent([prompt, audioPart]);
      responseText = response.response.text();
      if (responseText) {
        console.log(`✅ [Gemini Audio Transcribe] Model ${modelName} phản hồi thành công!`);
        break;
      }
    } catch (err: any) {
      console.warn(`⚠️ [Gemini Audio Transcribe] Model ${modelName} gặp sự cố: ${err.message}. Đang thử model tiếp theo...`);
      lastError = err;
    }
  }

  if (!responseText) {
    throw new Error(`Tất cả các model Gemini đều không phản hồi: ${lastError?.message || "Lỗi không xác định"}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(responseText);
  } catch (err) {
    // Làm sạch chuỗi JSON nếu có bọc markdown
    const cleaned = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
    parsed = JSON.parse(cleaned);
  }

  const fullText = (parsed.fullText || "").trim();
  const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : [];
  let duration = typeof parsed.duration === "number" ? parsed.duration : 0;

  const segments: TranscriptionSegment[] = rawSegments.map((item: any, index: number) => {
    const start = typeof item.start === "number" ? item.start : 0;
    const end = typeof item.end === "number" ? item.end : start;
    if (end > duration) duration = end;

    return {
      id: item.id ?? index,
      start: Number(start.toFixed(2)),
      end: Number(end.toFixed(2)),
      startFormatted: formatTime(start),
      endFormatted: formatTime(end),
      text: (item.text || "").trim(),
      pinyin: (item.pinyin || "").trim(),
      meaningVi: (item.meaningVi || item.meaning || item.translation || "").trim(),
    };
  });

  const fullTranslation = (parsed.fullTranslation || "").trim();

  if (segments.length === 0 && fullText.length > 0) {
    segments.push({
      id: 0,
      start: 0,
      end: duration,
      startFormatted: "00:00",
      endFormatted: formatTime(duration),
      text: fullText,
      pinyin: "",
      meaningVi: fullTranslation,
    });
  }

  console.log(`✅ [Gemini Audio Transcribe] Thành công! Tổng câu: ${segments.length}, thời lượng: ${duration}s`);

  return {
    fullText,
    fullTranslation,
    duration: Number(duration.toFixed(2)),
    segments,
    language,
  };
}
