import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import { verifyAccessToken } from "../lib/jwt.js";
import { User, publicUser } from "../models/User.js";

// JWT verification middleware (the assignment's challenge requirement).
//
// How a caller proves who they are:
//  1. Preferred — `Authorization: Bearer <token>`, a JWT issued by
//     POST /api/auth/token after a Better Auth sign-in. Verified here
//     with jsonwebtoken against JWT_SECRET.
//  2. Fallback — the Better Auth session cookie, verified through
//     auth.api.getSession(). This lets the client work even before it
//     adopts the token exchange.
//
// Either way, the user is then re-loaded from the database: the role and
// blocked status in req.user are always fresh, never trusted from the
// token payload. Blocked users are rejected from every protected route.
export async function authenticate(req, res, next) {
  try {
    let userId = null;
    const header = req.headers.authorization || "";

    if (header.startsWith("Bearer ")) {
      const token = header.slice(7).trim();
      if (!token) {
        return res
          .status(401)
          .json({ success: false, message: "Please sign in to continue." });
      }
      try {
        const payload = verifyAccessToken(token);
        userId = payload.sub;
      } catch {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired token. Please sign in again.",
        });
      }
    } else {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      if (session?.user) userId = session.user.id;
    }

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Please sign in to continue." });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Account not found. Please sign in again.",
      });
    }
    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account is blocked. Please contact the salon.",
      });
    }

    req.user = publicUser(user);
    return next();
  } catch (error) {
    return next(error);
  }
}

// Server-side role check. Frontend links are never trusted — every
// protected route verifies the role here.
export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Please sign in to continue." });
    }
    if (req.user.role !== role) {
      return res.status(403).json({
        success: false,
        message: `Only ${role}s can access this.`,
      });
    }
    return next();
  };
}
