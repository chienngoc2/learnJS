import express from "express";
import { upload } from "../utils/upload.js";
import {
  transcribe,
  handleChat,
  saveHistory,
  generateDirectGrammarQuiz,
} from "../controllers/chatController.js";

const router = express.Router();

// AI & Speech Routes
router.post("/transcribe", upload.single("audio"), transcribe);
router.post("/chat", handleChat);

// History Routes
router.post("/save-history", saveHistory);
router.post("/generate-direct-grammar-quiz", generateDirectGrammarQuiz);

export default router;
