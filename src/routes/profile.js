import express from "express";
import { User, publicUser } from "../models/User.js";
import { authenticate } from "../middleware/auth.js";
import { uploadImage } from "../middleware/upload.js";
import { uploadImageToImgBB } from "../lib/imgbb.js";
import { asyncHandler, httpError, sendSuccess } from "../utils/helpers.js";

const router = express.Router();

// GET /api/profile/me — any signed-in user. Their own profile.
router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    return sendSuccess(res, { user: req.user });
  })
);

// PATCH /api/profile/me — any signed-in user. Only name, image and phone
// may change. role, isBlocked and email are rejected outright — a user
// must never be able to promote themselves or unblock themselves — and a
// user can only ever update their own profile (the id comes from the
// verified token, never from the request body).
//
// The image can be an uploaded file (multipart field "image", sent to
// ImgBB) or an image URL string in JSON { image: "https://..." }.
router.patch(
  "/me",
  authenticate,
  uploadImage,
  asyncHandler(async (req, res) => {
    const { role, isBlocked, email, password, ...rest } = req.body;
    if (
      role !== undefined ||
      isBlocked !== undefined ||
      email !== undefined ||
      password !== undefined
    ) {
      throw httpError(
        400,
        "Role, blocked status, email and password cannot be changed here."
      );
    }

    const updates = {};
    if (rest.name !== undefined) {
      if (typeof rest.name !== "string" || !rest.name.trim()) {
        throw httpError(400, "Name cannot be empty.");
      }
      updates.name = rest.name.trim();
    }
    if (rest.phone !== undefined) {
      updates.phone =
        typeof rest.phone === "string" ? rest.phone.trim() : rest.phone;
    }
    if (req.file) {
      updates.image = await uploadImageToImgBB(
        req.file.buffer,
        req.file.originalname
      );
    } else if (rest.image !== undefined) {
      if (typeof rest.image !== "string" || !rest.image.trim()) {
        throw httpError(400, "Image must be a valid URL.");
      }
      updates.image = rest.image.trim();
    }

    if (Object.keys(updates).length === 0) {
      throw httpError(400, "Nothing to update.");
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
    });
    if (!user) throw httpError(404, "User not found.");
    return sendSuccess(res, { user: publicUser(user) });
  })
);

export default router;
