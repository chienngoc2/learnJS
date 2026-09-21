// File: routes/chatbot.js

import express from "express";
import upload from "../utils/upload.js";
import {
  transcribe,
  evaluatePronunciation,
  handleChat,
  saveHistory,
  generateDirectGrammarQuiz,
  getDailySuggestion,
} from "../controllers/chatController.js";
import { protect, optionalAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

// 💡 Route gợi ý học tập hàng ngày (hỗ trợ cả khách lẫn user)
router.get("/daily-suggestion", optionalAuth, getDailySuggestion);

// 🛡️ Tất cả các route chatbot bên dưới đều yêu cầu đăng nhập
router.use(protect);

// AI & Speech Routes
router.post("/transcribe", upload.single("audio"), transcribe);
router.post("/evaluate-pronunciation", upload.single("audio"), evaluatePronunciation);
router.post("/chat", handleChat);

// History & Quiz Routes
router.post("/save-history", saveHistory);
router.post("/generate-direct-grammar-quiz", generateDirectGrammarQuiz);

export default router;
