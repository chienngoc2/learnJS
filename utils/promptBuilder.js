import { selectPersona } from "./prompts/persona.js";
import {
  getRAGInstruction,
  getNormalInstruction,
} from "./prompts/systemPrompts.js";
import { financeExpertPrompt } from "./prompts/financePrompt.js";

/**
 * Hàm xây dựng Prompt tổng hợp (RAG + Persona + Real-time context)
 */
export function buildRAGPrompt(userText, relatedMemories) {
  // 1. Khởi tạo Persona gốc (Tự động chọn Sensei/Friend/Professor)
  let finalPrompt = selectPersona(userText);

  // 2. Lấy thời gian thực (Giúp AI chào hỏi sáng/chiều/tối chuẩn xác)
  const now = new Date();
  const date = now.toLocaleDateString("vi-VN");
  const day = now.toLocaleDateString("vi-VN", { weekday: "long" });

  // 3. Logic: Kiểm tra chủ đề Tài chính (Dành cho các mã DIG, SSI, DXG sếp đang theo dõi)
  const financeKeywords = [
    "vàng",
    "chứng khoán",
    "cổ phiếu",
    "bitcoin",
    "crypto",
    "tài chính",
    "đầu tư",
    "usd",
    "sjc",
    "dig",
    "ssi",
    "pdr",
    "dxg",
  ];

  const isFinance = financeKeywords.some((key) =>
    userText.toLowerCase().includes(key),
  );

  if (isFinance) {
    finalPrompt +=
      "\n\n[Hệ thống]: Kích hoạt chế độ Chuyên gia Tài chính. " +
      financeExpertPrompt;
  }

  // 4. Logic RAG: Nạp ký ức từ Pinecone hoặc chỉ nạp thông tin thời gian
  if (relatedMemories && relatedMemories.trim() !== "") {
    // Nếu có ký ức liên quan, AI sẽ trả lời dựa trên quá khứ của sếp
    finalPrompt += `\n\n${getRAGInstruction(day, date, relatedMemories)}`;
  } else {
    // Nếu không có ký ức, chỉ nạp thông tin thời gian thực
    finalPrompt += `\n\n${getNormalInstruction(day, date)}`;
  }

  return finalPrompt;
}
