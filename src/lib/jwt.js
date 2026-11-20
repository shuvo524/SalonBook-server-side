import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

// JWT access tokens for API calls. A client gets one from
// POST /api/auth/token after signing in with Better Auth, then sends it as
// `Authorization: Bearer <token>`. The token only identifies the user — the
// role and blocked status are always re-read from the database by the auth
// middleware, so a stale token can never escalate privileges.

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      role: user.role || "customer",
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtSecret);
}
