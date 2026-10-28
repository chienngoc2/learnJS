import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { pipeline } from "@huggingface/transformers";
import pkg from "wavefile";

const { WaveFile } = pkg;

// Cấu hình đường dẫn ffmpeg binary tĩnh
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// Singleton pipeline instance để không phải reload model mỗi lần gọi
let transcriberInstance: any = null;
let isLoadingModel = false;
let modelLoadPromise: Promise<any> | null = null;

export async function getTranscriber() {
  if (transcriberInstance) {
    return transcriberInstance;
  }
  if (isLoadingModel && modelLoadPromise) {
    return await modelLoadPromise;
  }

  isLoadingModel = true;
  modelLoadPromise = (async () => {
    try {
      console.log("🎙️ [Whisper Local] Đang khởi tạo mô hình Whisper (0 token, 100% offline)...");
      const pipe = await pipeline(
        "automatic-speech-recognition",
        "onnx-community/whisper-base",
        { dtype: "fp32" }
      );
      transcriberInstance = pipe;
      console.log("✅ [Whisper Local] Khởi tạo mô hình thành công!");
      return pipe;
    } catch (err: any) {
      console.error("❌ [Whisper Local] Lỗi khởi tạo mô hình:", err);
      throw err;
    } finally {
      isLoadingModel = false;
      modelLoadPromise = null;
    }
  })();

  return await modelLoadPromise;
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
 * Chuyển đổi file âm thanh bất kỳ (MP3, M4A, AAC, WAV...) sang định dạng 16kHz mono WAV PCM
 */
export async function convertTo16kHzWav(inputBuffer: Buffer, originalExt: string = ".mp3"): Promise<string> {
  const randomId = crypto.randomBytes(8).toString("hex");
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `input_${randomId}${originalExt}`);
  const outputPath = path.join(tempDir, `output_${randomId}.wav`);

  // Ghi buffer vào file tạm
  await fs.promises.writeFile(inputPath, inputBuffer);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat("wav")
      .audioChannels(1) // Mono
      .audioFrequency(16000) // 16kHz chuẩn cho Whisper
      .audioCodec("pcm_s16le")
      .on("end", async () => {
        // Dọn dẹp file input tạm ngay khi ffmpeg convert xong
        try {
          if (fs.existsSync(inputPath)) await fs.promises.unlink(inputPath);
        } catch (e) {}
        resolve(outputPath);
      })
      .on("error", async (err) => {
        // Dọn dẹp file tạm khi lỗi
        try {
          if (fs.existsSync(inputPath)) await fs.promises.unlink(inputPath);
          if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
        } catch (e) {}
        reject(new Error(`Lỗi chuyển đổi ffmpeg: ${err.message}`));
      })
      .save(outputPath);
  });
}

export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  startFormatted: string;
  endFormatted: string;
  text: string;
}

export interface TranscriptionResult {
  fullText: string;
  duration: number;
  segments: TranscriptionSegment[];
  language: string;
}

/**
 * Bóc Script (Transcription) hoàn toàn miễn phí chạy trực tiếp trên Server (0 token, 0 Groq)
 */
export async function transcribeAudioBuffer(
  audioBuffer: Buffer,
  fileName: string = "audio.mp3",
  language: string = "chinese"
): Promise<TranscriptionResult> {
  let wavFilePath: string | null = null;

  try {
    const ext = path.extname(fileName) || ".mp3";
    console.log(`🎙️ [Whisper Local] Bắt đầu xử lý file: ${fileName} (${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

    // 1. Chuyển đổi âm thanh sang 16kHz mono WAV
    wavFilePath = await convertTo16kHzWav(audioBuffer, ext);

    // 2. Đọc file WAV và chuyển đổi sang Float32Array chuẩn hoá
    const wavBuffer = await fs.promises.readFile(wavFilePath);
    const wav = new WaveFile(wavBuffer);
    wav.toBitDepth("32f");
    let audioSamples: any = wav.getSamples();

    // Nếu là stereo (đa kênh), tính trung bình để gộp về mono
    if (Array.isArray(audioSamples) && audioSamples.length > 1) {
      const scalingFactor = Math.sqrt(2);
      const mono = new Float32Array(audioSamples[0].length);
      for (let i = 0; i < audioSamples[0].length; ++i) {
        mono[i] = (audioSamples[0][i] + audioSamples[1][i]) / scalingFactor;
      }
      audioSamples = mono;
    } else if (Array.isArray(audioSamples) && audioSamples.length === 1) {
      audioSamples = audioSamples[0];
    }

    // 3. Lấy instance pipeline Whisper
    const transcriber = await getTranscriber();

    // 4. Thực thi nhận diện giọng nói
    console.log(`🎙️ [Whisper Local] Đang nhận dạng tiếng Trung với Whisper ONNX...`);
    const output = await transcriber(audioSamples, {
      return_timestamps: true,
      language: language,
      task: "transcribe",
    });

    const fullText = (output.text || "").trim();
    const rawChunks = Array.isArray(output.chunks) ? output.chunks : [];

    let totalDuration = 0;
    const segments: TranscriptionSegment[] = rawChunks.map((chunk: any, index: number) => {
      const start = Array.isArray(chunk.timestamp) ? chunk.timestamp[0] ?? 0 : 0;
      const end = Array.isArray(chunk.timestamp) ? chunk.timestamp[1] ?? start : start;
      if (end > totalDuration) totalDuration = end;

      return {
        id: index,
        start: Number(start.toFixed(2)),
        end: Number(end.toFixed(2)),
        startFormatted: formatTime(start),
        endFormatted: formatTime(end),
        text: (chunk.text || "").trim(),
      };
    });

    // Nếu không có chunk tách rời mà có fullText, tạo 1 segment duy nhất
    if (segments.length === 0 && fullText.length > 0) {
      segments.push({
        id: 0,
        start: 0,
        end: totalDuration,
        startFormatted: "00:00",
        endFormatted: formatTime(totalDuration),
        text: fullText,
      });
    }

    console.log(`✅ [Whisper Local] Bóc script thành công! Tổng câu: ${segments.length}, độ dài: ${totalDuration.toFixed(1)}s`);

    return {
      fullText,
      duration: Number(totalDuration.toFixed(2)),
      segments,
      language,
    };
  } finally {
    // Luôn dọn dẹp file wav tạm trong ổ đĩa
    if (wavFilePath && fs.existsSync(wavFilePath)) {
      try {
        await fs.promises.unlink(wavFilePath);
      } catch (e) {}
    }
  }
}
