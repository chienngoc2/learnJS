import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const COOLDOWN_MS = 10 * 60 * 1000; // 10 phút cooldown khi key bị 429/hết quota
const keyCooldownUntil = new Map<string, number>();

/**
 * Thu thập toàn bộ Gemini API Keys từ biến môi trường:
 * - GEMINI_API_KEYS (phân tách bởi dấu phẩy)
 * - GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, ...
 */
export function getConfiguredGeminiKeys(): string[] {
  const keys: string[] = [];

  if (process.env.GEMINI_API_KEYS) {
    for (const raw of process.env.GEMINI_API_KEYS.split(",")) {
      const k = raw.trim();
      if (k && !keys.includes(k)) keys.push(k);
    }
  }

  const singleEnvNames = [
    "GEMINI_API_KEY",
    "GEMINI_API_KEY_2",
    "GEMINI_API_KEY_3",
    "GEMINI_API_KEY_4",
    "GEMINI_API_KEY_5",
  ];
  for (const name of singleEnvNames) {
    const k = (process.env[name] || "").trim();
    if (k && !keys.includes(k)) keys.push(k);
  }

  return keys;
}

function isQuotaOrAuthError(err: any): boolean {
  const msg = String(err?.message || "").toLowerCase();
  const status = err?.status || err?.response?.status;
  return (
    status === 429 ||
    status === 401 ||
    status === 403 ||
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("too many requests") ||
    msg.includes("api_key_invalid") ||
    msg.includes("api key not valid")
  );
}

/**
 * Thực thi một tác vụ Gemini với cơ chế xoay vòng khóa tự động.
 * Nếu key hiện tại hết token/quota (429), tự động đánh dấu cooldown và xoay sang key kế tiếp.
 */
export async function withGeminiRotation<T>(
  runner: (client: GoogleGenerativeAI, apiKey: string, keyIndex: number) => Promise<T>
): Promise<T> {
  const allKeys = getConfiguredGeminiKeys();
  if (allKeys.length === 0) {
    throw new Error("Chưa cấu hình GEMINI_API_KEY hoặc GEMINI_API_KEY_2 trong biến môi trường.");
  }

  const now = Date.now();
  // Ưu tiên các key chưa bị cooldown trước, sau đó mới thử lại các key đang cooldown
  const readyKeys = allKeys.filter((k) => (keyCooldownUntil.get(k) || 0) <= now);
  const coolingKeys = allKeys.filter((k) => (keyCooldownUntil.get(k) || 0) > now);
  const orderedKeys = [...readyKeys, ...coolingKeys];

  let lastError: any = null;

  for (let i = 0; i < orderedKeys.length; i++) {
    const apiKey = orderedKeys[i];
    const keyIndex = allKeys.indexOf(apiKey) + 1;
    try {
      const client = new GoogleGenerativeAI(apiKey);
      return await runner(client, apiKey, keyIndex);
    } catch (err: any) {
      lastError = err;
      if (isQuotaOrAuthError(err)) {
        keyCooldownUntil.set(apiKey, Date.now() + COOLDOWN_MS);
        console.warn(
          `🔄 [Gemini Key Rotation] Key #${keyIndex} gặp giới hạn/lỗi (${err.message}). Đang xoay sang key tiếp theo...`
        );
      } else {
        // Lỗi model không tồn tại hoặc 503 tạm thời -> vẫn thử tiếp nếu cần, hoặc ném cho caller xử lý model fallback
        throw err;
      }
    }
  }

  throw lastError || new Error("Tất cả Gemini API key đều đã hết hạn mức.");
}

export function getGeminiKeyCount(): number {
  return getConfiguredGeminiKeys().length;
}
