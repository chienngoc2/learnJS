import express from "express";
import cors from "cors";

import connectDB from "./config/db.js";
import kanjiRoutes from "./routes/kanji.js";
// Import Routes
import vocabRoute from "./routes/vocab.js";
import chatbotRoutes from "./routes/chatbot.js";
// import noteRoutes from "./routes/notes.js"; // Nếu bản V2 vẫn dùng thì mở ra
import ragRoutes from "./routes/ragRoutes.js";

import dotenv from "dotenv";
dotenv.config();
const app = express();

// 1. Kết nối Database
connectDB();

// 2. Cấu hình Middleware
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);
app.use(express.json());
// app.use(express.static("public")); // Nếu chỉ làm API cho Mobile thì không cần dòng này

// 3. Kết nối Router (Prefix rõ ràng để sau này dễ quản lý)
app.use("/api/chat", chatbotRoutes);
app.use("/api/vocab", vocabRoute);
// app.use("/api/notes", noteRoutes);
app.use("/api/rag", ragRoutes);
app.use("/api/kanji", kanjiRoutes);

const PORT = process.env.PORT || 5000;

// Chỉ chạy app.listen khi sếp code ở máy local
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    const isRender = process.env.MONGODB_URI;
    console.log(`
    =================================================
    🚀 SERVER ĐÃ KHỞI ĐỘNG THÀNH CÔNG!
    =================================================
    🌍 Chế độ: DEVELOPMENT (Local)
    🔗 URL: http://localhost:${PORT}
    =================================================
    `);
  });
}

// 🔥 BẮT BUỘC PHẢI CÓ DÒNG NÀY CHO VERCEL:
// Xuất app ra để hệ thống Serverless của Vercel tự động tiếp quản
export default app;