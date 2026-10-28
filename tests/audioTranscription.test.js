/**
 * Audio Transcription Integration Test
 * Verifies local Whisper model pipeline and audio conversion (0 Token, 0 Groq)
 */

import { transcribeAudioBuffer, formatTime } from "../utils/audioTranscriber.js";
import pkg from "wavefile";
const { WaveFile } = pkg;

async function testAudioTranscription() {
  console.log("\n=======================================================");
  console.log("🧪 TEST TRANSCRIPTION WHISPER LOCAL (0 TOKEN, 0 GROQ)");
  console.log("=======================================================\n");

  // 1. Test formatTime
  console.log("⏳ Test 1: formatTime function...");
  if (formatTime(65) !== "01:05" || formatTime(0) !== "00:00") {
    throw new Error(`formatTime failed: ${formatTime(65)}`);
  }
  console.log("✅ PASS: formatTime");

  // 2. Generate 1.5 second test tone in WAV format
  console.log("⏳ Test 2: Generating synthetic 16kHz WAV buffer...");
  const wav = new WaveFile();
  const sampleRate = 16000;
  const numSamples = sampleRate * 1.5;
  const samples = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000;
  }
  wav.fromScratch(1, sampleRate, "16", samples);
  const buffer = Buffer.from(wav.toBuffer());
  console.log(`✅ PASS: WAV buffer created (${buffer.length} bytes)`);

  // 3. Test local Whisper transcription
  console.log("⏳ Test 3: Running transcribeAudioBuffer (Whisper ONNX)...");
  const result = await transcribeAudioBuffer(buffer, "test_audio.wav", "chinese");

  if (!result || typeof result.fullText !== "string") {
    throw new Error("Result missing fullText string");
  }
  if (!Array.isArray(result.segments)) {
    throw new Error("Result missing segments array");
  }
  if (typeof result.duration !== "number" || result.duration <= 0) {
    throw new Error("Result duration must be positive number");
  }

  console.log(`✅ PASS: Whisper result generated successfully!`);
  console.log(`   - Duration: ${result.duration}s`);
  console.log(`   - Segments: ${result.segments.length}`);
  console.log(`   - Language: ${result.language}`);

  console.log("\n🎉 TEST AUDIO TRANSCRIPTION HOÀN TẤT THÀNH CÔNG 100%!\n");
}

testAudioTranscription().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
