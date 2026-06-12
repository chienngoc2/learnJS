// File: routes/vocab.js

import express from "express";
import {
  getAllLists,
  getListById,
  logView,
  createList,
  saveReviewList,
  updateList,
  deleteList,
  addOrUpdateGrammar,
  deleteSingleGrammar,
  updateSingleGrammar,
  getAllGrammarPointsOnly,
} from "../controllers/vocabController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// 🛡️ Tất cả các route từ vựng bên dưới đều yêu cầu đăng nhập
router.use(protect);

// 👥 Routes dùng chung cho cả Học viên (student) & Admin
router.get("/lists", getAllLists);
router.get("/list/:id", getListById);
router.post("/log-view", logView);
router.get("/all-grammar-points", getAllGrammarPointsOnly);
router.post("/save-review", saveReviewList);

// 👑 Routes chỉ dành riêng cho Admin (quản lý bài học)
router.use(authorize("admin"));

router.post("/save", createList);
router.put("/update/:id", updateList);
router.delete("/delete/:id", deleteList);
router.post("/add-grammar-upsert", addOrUpdateGrammar);
router.put("/update-grammar/:topicId/:grammarId", updateSingleGrammar);
router.delete("/delete-grammar/:topicId/:grammarId", deleteSingleGrammar);

export default router;
