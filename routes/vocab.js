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
import { protect, authorize, optionalAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

// 👥 Routes danh sách từ vựng & ngữ pháp (hỗ trợ cả khách lẫn học viên đã đăng nhập)
router.get("/lists", optionalAuth, getAllLists);
router.get("/list/:id", optionalAuth, getListById);
router.post("/log-view", optionalAuth, logView);
router.get("/all-grammar-points", optionalAuth, getAllGrammarPointsOnly);

// 📚 Quản lý từ vựng & ngữ pháp
router.post("/save-review", optionalAuth, saveReviewList);
router.post("/save", optionalAuth, createList);
router.put("/update/:id", optionalAuth, updateList);
router.delete("/delete/:id", optionalAuth, deleteList);
router.post("/add-grammar-upsert", optionalAuth, addOrUpdateGrammar);
router.put("/update-grammar/:topicId/:grammarId", optionalAuth, updateSingleGrammar);
router.delete("/delete-grammar/:topicId/:grammarId", optionalAuth, deleteSingleGrammar);

export default router;
