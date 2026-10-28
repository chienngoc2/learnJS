/**
 * Audio Transcription Integration Test
 * Verifies Gemini Flash audio pipeline (Zero heavy dependencies, 100% Vercel friendly, 0 Groq)
 */

import { transcribeAudioBuffer, formatTime } from "../utils/audioTranscriber.js";

function createSyntheticWav(sampleRate = 16000, seconds = 1.5) {
  const numSamples = Math.floor(sampleRate * seconds);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // 440Hz sine wave tone
  for (let i = 0; i < numSamples; i++) {
    const val = Math.floor(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000);
    buffer.writeInt16LE(val, 44 + i * 2);
  }

  return buffer;
}

async function testAudioTranscription() {
  console.log("\n=======================================================");
  console.log("🧪 TEST TRANSCRIPTION GEMINI FLASH (0 GROQ, VERCEL COMPATIBLE)");
  console.log("=======================================================\n");

  // 1. Test formatTime
  console.log("⏳ Test 1: formatTime function...");
  if (formatTime(65) !== "01:05" || formatTime(0) !== "00:00") {
    throw new Error(`formatTime failed: ${formatTime(65)}`);
  }
  console.log("✅ PASS: formatTime");

  // 2. Generate 1.5 second test tone in WAV format
  console.log("⏳ Test 2: Generating synthetic 16kHz WAV buffer...");
  const buffer = createSyntheticWav(16000, 1.5);
  console.log(`✅ PASS: WAV buffer created (${buffer.length} bytes)`);

  // 3. Test Gemini transcription
  console.log("⏳ Test 3: Running transcribeAudioBuffer (Gemini Flash)...");
  const result = await transcribeAudioBuffer(buffer, "test_audio.wav", "chinese");

  if (!result || typeof result.fullText !== "string") {
    throw new Error("Result missing fullText string");
  }
  if (!Array.isArray(result.segments)) {
    throw new Error("Result missing segments array");
  }
  if (typeof result.duration !== "number") {
    throw new Error("Result duration must be number");
  }

  console.log(`✅ PASS: Audio transcription result generated successfully!`);
  console.log(`   - Duration: ${result.duration}s`);
  console.log(`   - Segments: ${result.segments.length}`);
  console.log(`   - Language: ${result.language}`);

  console.log("\n🎉 TEST AUDIO TRANSCRIPTION HOÀN TẤT THÀNH CÔNG 100%!\n");
}

testAudioTranscription().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
