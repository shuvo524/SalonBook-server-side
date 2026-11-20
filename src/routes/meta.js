import express from "express";
import { TIME_SLOTS } from "../config/timeSlots.js";
import { SERVICE_CATEGORIES } from "../models/Service.js";
import { asyncHandler, sendSuccess } from "../utils/helpers.js";

const router = express.Router();

// GET /api/meta/time-slots — the predefined booking slots (public).
router.get(
  "/time-slots",
  asyncHandler(async (req, res) => {
    return sendSuccess(res, { timeSlots: TIME_SLOTS });
  })
);

// GET /api/meta/categories — the suggested service categories (public).
router.get(
  "/categories",
  asyncHandler(async (req, res) => {
    return sendSuccess(res, { categories: SERVICE_CATEGORIES });
  })
);

export default router;
