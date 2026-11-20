import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { mongoClient, nativeDb } from "../config/db.js";
import { clientOrigins, config } from "../config/env.js";

// Better Auth instance. It owns the `user`, `session`, `account` and
// `verification` collections through its MongoDB adapter.
//
// Security notes:
// - `role` and `isBlocked` are `input: false`, so no client can set them
//   through sign-up (Better Auth rejects such requests). Every new account
//   is a customer; admins are created only with scripts/promote-admin.js.
// - Google sign-in is enabled only when both OAuth credentials are set,
//   so the server still boots for local development without them.
export const auth = betterAuth({
  baseURL: config.betterAuthUrl,
  secret: config.betterAuthSecret,
  database: mongodbAdapter(nativeDb, { client: mongoClient }),
  trustedOrigins: clientOrigins(),
  emailAndPassword: {
    enabled: true,
    // Spec password rules: minimum 6 characters, one uppercase letter and
    // one lowercase letter. Length is enforced here; the letter rules are
    // enforced by the sign-up form (see API_CONTRACT.md).
    minPasswordLength: 6,
  },
  socialProviders:
    config.googleClientId && config.googleClientSecret
      ? {
          google: {
            clientId: config.googleClientId,
            clientSecret: config.googleClientSecret,
          },
        }
      : {},
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "customer",
        input: false,
      },
      isBlocked: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      phone: {
        type: "string",
        required: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once a day
  },
  // In production the client (Vercel) and server (Render) are on different
  // domains, so the session cookie must be SameSite=None + Secure to be
  // sent cross-site. Local development keeps the safer Lax default.
  advanced: config.cookieCrossSite
    ? { defaultCookieAttributes: { sameSite: "none", secure: true } }
    : {},
});
