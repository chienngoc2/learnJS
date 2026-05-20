// File: routes/ragRoutes.js

import express from "express";
import { generateQuizByTopic } from "../controllers/ragController.js";

const router = express.Router();

// Tạo đường dẫn POST để Mobile gửi topicId và tin nhắn lên
router.post("/generate-quiz", generateQuizByTopic);

export default router;
