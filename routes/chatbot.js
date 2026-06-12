// File: routes/chatbot.js

import express from "express";
import upload from "../utils/upload.js";
import {
  transcribe,
  handleChat,
  saveHistory,
  generateDirectGrammarQuiz,
  getDailySuggestion,
} from "../controllers/chatController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// 🛡️ Tất cả các route chatbot đều yêu cầu đăng nhập
router.use(protect);

// AI & Speech Routes
router.post("/transcribe", upload.single("audio"), transcribe);
router.post("/chat", handleChat);

// Daily Study Suggestion Route
router.get("/daily-suggestion", getDailySuggestion);

// History & Quiz Routes
router.post("/save-history", saveHistory);
router.post("/generate-direct-grammar-quiz", generateDirectGrammarQuiz);

export default router;
