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
Bạn là chuyên gia phiên âm và biên soạn giáo trình tiếng Trung (ưu tiên Phồn Thể - 繁體中文, TOCFL) kiêm dịch giả Trung - Việt cấp cao.
Nhiệm vụ của bạn là nghe toàn bộ file âm thanh và trích xuất kịch bản hoàn chỉnh từ đầu đến cuối.

QUY TẮC BẮT BUỘC TUÂN THỦ NGHIÊM NGẶT:
1. PHIÊN ÂM TRỌN VẸN 100% TOÀN BỘ FILE TỪ GIÂY ĐẦU TIÊN (00:00) ĐẾN GIÂY CUỐI CÙNG:
   - Câu đầu tiên (id: 0) BẮT BUỘC bắt đầu từ 0.0s (hoặc mốc giây đầu tiên có tiếng người nói). Tuyệt đối không được bỏ qua đoạn dạo đầu, intro nhạc, lời giới thiệu hay lời chào hỏi mở bài.
   - BẮT BUỘC phiên âm liên tục, đầy đủ toàn bộ nội dung từ đầu tới cuối bài. TUYỆT ĐỐI KHÔNG ĐƯỢC CHỈ CHỌN MỘT ĐOẠN Ở GIỮA, không được nhảy cóc, không được tóm tắt.
   - Câu cuối cùng BẮT BUỘC kéo dài đến hết nội dung nói cuối cùng của file âm thanh (lời kết bài, lời tạm biệt, lời cảm ơn).
2. TÁCH THÀNH TỪNG CÂU TỰ NHIÊN ĐỂ HỌC TẬP (KARAOKE SCRIPT):
   - Chia thành từng câu ngắn tự nhiên (khoảng 2 đến 8 giây mỗi câu) tương ứng với nhịp ngắt nghỉ của người nói để học viên có thể bấm nghe lại từng câu dễ dàng.
   - "start" và "end" là số thực chính xác tính bằng giây (ví dụ: start: 0.0, end: 3.25).
3. VỚI MỖI PHÂN ĐOẠN / CÂU TRONG "segments", CUNG CẤP ĐỦ:
   - "id": Số thứ tự tăng dần từ 0, 1, 2...
   - "start": Giây bắt đầu của câu (float).
   - "end": Giây kết thúc của câu (float).
   - "text": Câu tiếng Trung chuẩn xác bằng chữ Hán Phồn Thể (繁體中文).
   - "pinyin": Phiên âm Bính Âm có dấu thanh điệu chuẩn quốc tế (ví dụ: "Nǐ hǎo, huānyíng...").
   - "meaningVi": Bản dịch nghĩa tiếng Việt tự nhiên, sát nghĩa, chuẩn xác ngữ cảnh của câu.
4. "fullText": Nối toàn bộ các câu tiếng Trung từ đầu đến cuối bài thành một đoạn văn hoàn chỉnh.
5. "fullTranslation": Toàn bộ bản dịch tiếng Việt của cả bài nghe từ đầu đến cuối.
6. "duration": Tổng thời lượng thực tế của file âm thanh (đơn vị: giây, khớp với end của câu cuối cùng).

BẮT BUỘC trả về định dạng JSON thuần theo schema sau:
{
  "fullText": "Toàn bộ văn bản tiếng Trung Phồn Thể liền mạch từ đầu đến cuối bài",
  "fullTranslation": "Toàn bộ bản dịch nghĩa tiếng Việt đầy đủ từ đầu đến cuối bài",
  "duration": 45.2,
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
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
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
          maxOutputTokens: 65536,
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
