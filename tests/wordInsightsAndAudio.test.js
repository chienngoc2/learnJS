import assert from "assert";
import { getWordInsights } from "../utils/wordInsights.js";

async function runTests() {
  console.log("=======================================================");
  console.log("🧪 KIỂM THỬ TỰ ĐỘNG: WORD INSIGHTS & AUDIO LOGIC");
  console.log("=======================================================\n");

  // Test 1: Single Character Insights (走)
  process.stdout.write("⏳ 1. getWordInsights cho chữ '走'... ");
  const zouInsight = await getWordInsights("走");
  assert(zouInsight, "Kết quả trả về không được rỗng");
  assert.strictEqual(zouInsight.word, "走");
  assert.strictEqual(zouInsight.pinyin, "zǒu");
  assert.strictEqual(zouInsight.hanviet, "Tẩu");
  assert(Array.isArray(zouInsight.synonyms) && zouInsight.synonyms.length > 0, "Phải có danh sách từ đồng nghĩa");
  assert(Array.isArray(zouInsight.usages) && zouInsight.usages.length > 0, "Phải có danh sách các cách dùng/ngữ pháp");
  const syn = zouInsight.synonyms[0];
  assert(syn.word && syn.difference, "Từ đồng nghĩa phải có từ và phân biệt cách dùng");
  console.log("✅ PASS");

  // Test 2: Compound Word Insights (迷路)
  process.stdout.write("⏳ 2. getWordInsights cho từ ghép '迷路'... ");
  const miluInsight = await getWordInsights("迷路");
  assert(miluInsight, "Kết quả trả về không được rỗng");
  assert.strictEqual(miluInsight.word, "迷路");
  assert(miluInsight.meaning.includes("lạc") || miluInsight.meaning.includes("đường"), "Nghĩa phải chính xác");
  assert(Array.isArray(miluInsight.usages), "Phải có usages");
  console.log("✅ PASS");

  // Test 3: Cache behavior
  process.stdout.write("⏳ 3. Runtime cache test (gọi lại từ đã tra cứu)... ");
  const t0 = Date.now();
  const cachedZou = await getWordInsights("走");
  const t1 = Date.now();
  assert.strictEqual(cachedZou.word, "走");
  assert(t1 - t0 < 50, "Cache phải trả về tức thì < 50ms");
  console.log("✅ PASS");

  console.log("\n=======================================================");
  console.log("🎉 TẤT CẢ KIỂM THỬ WORD INSIGHTS HOÀN TOÀN THÀNH CÔNG!");
  console.log("=======================================================");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
