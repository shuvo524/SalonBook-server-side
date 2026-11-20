import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
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
// - Password rules (spec: minimum 6 characters, one uppercase and one
//   lowercase letter) are enforced here on the server, not just in the
//   sign-up form: length via minPasswordLength, the letter rules via the
//   before hook below. A client can never bypass them.
export const auth = betterAuth({
  baseURL: config.betterAuthUrl,
  secret: config.betterAuthSecret,
  database: mongodbAdapter(nativeDb, { client: mongoClient }),
  trustedOrigins: clientOrigins(),
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const password = ctx.body?.password;
      if (typeof password !== "string") return; // Better Auth validates presence
      if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
        throw new APIError("BAD_REQUEST", {
          message:
            "Password must contain at least one uppercase and one lowercase letter.",
        });
      }
    }),
  },
  emailAndPassword: {
    enabled: true,
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
  //
  // generateId as a FUNCTION returning UUID strings: user/session/
  // account ids are stored as PLAIN STRINGS. This is load-bearing for
  // the whole API — the Mongoose User model, appointment/transaction
  // customerId fields and the JWT subject all treat user ids as strings.
  // It must be a function, not the string "uuid": Better Auth's default
  // stores ObjectIds, and "uuid" stores BSON UUID binaries — with
  // either one, every authenticated lookup (User.findById) silently
  // returns null and all protected routes answer 401. A custom
  // generator function is the only option the MongoDB adapter stores
  // verbatim as a string.
  advanced: {
    database: { generateId: () => randomUUID() },
    ...(config.cookieCrossSite
      ? { defaultCookieAttributes: { sameSite: "none", secure: true } }
      : {}),
  },
});
