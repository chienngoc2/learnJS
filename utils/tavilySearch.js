import { tavily } from "@tavily/core";
import "dotenv/config";

// Khởi tạo client với Key từ .env
const tvlyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });

// Bộ nhớ đệm (Cache) để tránh tìm kiếm lặp lại trong thời gian ngắn
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

/**
 * Hàm giúp AI lướt web tìm kiếm thông tin thực tế
 */
export async function searchWeb(query) {
  try {
    const queryKey = query.toLowerCase().trim();

    // 1. Kiểm tra Cache trước
    if (searchCache.has(queryKey)) {
      const cachedData = searchCache.get(queryKey);
      if (Date.now() - cachedData.timestamp < CACHE_TTL) {
        console.log(`⚡ [Cache Hit]: "${query}"`);
        return cachedData.results;
      }
    }

    console.log(`🌐 [Web Search]: Đang tìm "${query}"...`);

    // 2. Nhận diện nếu là tin tức để tối ưu tìm kiếm (Hữu ích cho sếp xem mã DIG, SSI)
    const isNews =
      /tin|báo|news|sự kiện|hôm nay|hôm qua|giá|cổ phiếu|chứng khoán/i.test(
        queryKey,
      );

    const searchOptions = {
      searchDepth: "advanced",
      maxResults: 3,
      includeImages: true, // Sếp bật cái này để lấy ảnh minh họa cho trực quan
    };

    if (isNews) {
      searchOptions.topic = "news";
      searchOptions.days = 2; // Ưu tiên tin mới trong 2 ngày gần nhất
    }

    const response = await tvlyClient.search(query, searchOptions);

    // 3. Xử lý dữ liệu văn bản
    let results = response.results
      .map(
        (r) =>
          `[Nguồn: ${r.title} | URL: ${r.url}]\nNội dung: ${r.content.substring(0, 500)}...`,
      )
      .join("\n\n========================\n\n");

    // 4. Xử lý ảnh minh họa
    if (response.images && response.images.length > 0) {
      // Gửi link ảnh về để AI có thể hiển thị trên giao diện Chat
      results += `\n\n[IMAGE_URL: ${response.images[0]}]`;
    }

    // 5. Lưu vào Cache và trả về
    searchCache.set(queryKey, { results, timestamp: Date.now() });
    return results;
  } catch (err) {
    console.error("❌ Lỗi search web:", err.message);
    return "Lỗi: Không thể kết nối Internet để tìm kiếm thông tin lúc này.";
  }
}
