import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import connectDB from "./config/db.js";
import kanjiRoutes from "./routes/kanji.js";
// Import Routes
import vocabRoute from "./routes/vocab.js";
import chatbotRoutes from "./routes/chatbot.js";
import authRoutes from "./routes/authRoutes.js";
// import noteRoutes from "./routes/notes.js"; // Nếu bản V2 vẫn dùng thì mở ra
import ragRoutes from "./routes/ragRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";

import dotenv from "dotenv";
dotenv.config();
const app = express();

// 1. Kết nối Database
connectDB();

// 2. Cấu hình Middleware
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);
app.use(express.json());
// app.use(express.static("public")); // Nếu chỉ làm API cho Mobile thì không cần dòng này

// 3. Kết nối Router (Prefix rõ ràng để sau này dễ quản lý)
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatbotRoutes);
app.use("/api/vocab", vocabRoute);
// app.use("/api/notes", noteRoutes);
app.use("/api/rag", ragRoutes);
app.use("/api/kanji", kanjiRoutes);

// Phục vụ các tệp tĩnh và fallback định tuyến của Frontend khi có thư mục build 'dist'
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "../AI_Sensei_Web/dist");

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Global Error Handler Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Khởi chạy HTTP Server trên các môi trường thông thường (Local, Render, Heroku...), ngoại trừ Vercel
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`
    =================================================
    🚀 SERVER ĐÃ KHỞI ĐỘNG THÀNH CÔNG!
    =================================================
    🌍 Chế độ: DEVELOPMENT/PRODUCTION (Non-Vercel)
    🔗 URL: http://localhost:${PORT}
    =================================================
    `);
  });
}

// 🔥 BẮT BUỘC PHẢI CÓ DÒNG NÀY CHO VERCEL:
// Xuất app ra để hệ thống Serverless của Vercel tự động tiếp quản
export default app;