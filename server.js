import express from "express";
import cors from "cors";
import "dotenv/config";
import connectDB from "./config/db.js"; // Import từ file config sếp vừa tạo

// Import Routes (Sếp nhớ kiểm tra đường dẫn file nhé)
import vocabRoute from "./routes/vocab.js";
import chatbotRoutes from "./routes/chatbot.js";
// import noteRoutes from "./routes/notes.js"; // Nếu bản V2 vẫn dùng thì mở ra
import ragRoutes from "./routes/ragRoutes.js";
const app = express();

// 1. Kết nối Database
connectDB();

// 2. Cấu hình Middleware
app.use(cors());
app.use(express.json());
// app.use(express.static("public")); // Nếu chỉ làm API cho Mobile thì không cần dòng này

// 3. Kết nối Router (Prefix rõ ràng để sau này dễ quản lý)
app.use("/api/chat", chatbotRoutes);
app.use("/api/vocab", vocabRoute);
// app.use("/api/notes", noteRoutes);
app.use("/api/rag", ragRoutes);

// 4. Khởi động Server
const PORT = process.env.PORT || 5000; // Thường BE để 5000 để tránh đụng 3000 của FE

app.listen(PORT, () => {
  console.log(`
=================================================
🚀 SERVER V2.0 ĐÃ KHỞI ĐỘNG THÀNH CÔNG!
=================================================
🌍 Chế độ: ${process.env.MONGODB_URI ? "PRODUCTION (Cloud)" : "DEVELOPMENT (Local)"}
🔗 URL: http://localhost:${PORT}
=================================================
  `);
});
