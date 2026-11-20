import express from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import { signAccessToken } from "../lib/jwt.js";
import { User, publicUser } from "../models/User.js";
import { asyncHandler, httpError, sendSuccess } from "../utils/helpers.js";

const router = express.Router();

// POST /api/auth/token — exchange a valid Better Auth session (cookie)
// for a JWT access token for API calls.
//
// Flow: the client signs in with Better Auth (email/password or Google),
// which sets the session cookie. It then calls this endpoint once, stores
// the returned JWT, and sends it as `Authorization: Bearer <token>` on
// every protected API request.
//
// Mounted in app.js BEFORE the Better Auth handler, so this exact path is
// answered here and not by Better Auth's own routes.
router.post(
  "/token",
  asyncHandler(async (req, res) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session?.user) {
      throw httpError(401, "Please sign in first.");
    }

    const user = await User.findById(session.user.id).lean();
    if (!user) throw httpError(401, "Account not found.");
    if (user.isBlocked) {
      throw httpError(403, "Your account is blocked.");
    }

    const token = signAccessToken({
      id: String(user._id),
      email: user.email,
      role: user.role,
    });
    return sendSuccess(res, { token, user: publicUser(user) });
  })
);

export default router;
