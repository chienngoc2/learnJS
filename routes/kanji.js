import express from "express";
import { searchKanji } from "../controllers/kanjiController.js";

const router = express.Router();

// Đường dẫn đầy đủ sẽ là: GET /api/kanji/search?q=一
router.get("/search", searchKanji);

export default router;
