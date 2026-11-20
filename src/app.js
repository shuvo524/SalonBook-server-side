import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import { clientOrigins } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import authTokenRouter from "./routes/authToken.js";
import servicesRouter from "./routes/services.js";
import appointmentsRouter from "./routes/appointments.js";
import usersRouter from "./routes/users.js";
import paymentsRouter, {
  stripeWebhookHandler,
} from "./routes/payments.js";
import profileRouter from "./routes/profile.js";
import dashboardRouter from "./routes/dashboard.js";
import metaRouter from "./routes/meta.js";

export const app = express();

// CORS: only the client origin(s) may call this API, with credentials so
// the Better Auth session cookie works.
app.use(cors({ origin: clientOrigins(), credentials: true }));

// Stripe webhook FIRST, with a raw body — signature verification needs the
// untouched request bytes, so this must run before express.json().
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);

// JWT exchange BEFORE the Better Auth handler, so POST /api/auth/token is
// answered here and not swallowed by /api/auth/* below.
app.use("/api/auth", authTokenRouter);

// Better Auth: sign-up, sign-in, sign-out, session, Google OAuth.
// Mounted before express.json() so it reads the raw request body itself.
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SalonBook server is running.",
    docs: "See API_CONTRACT.md for the endpoint reference.",
  });
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "ok" });
});

app.use("/api/services", servicesRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/users", usersRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/profile", profileRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/meta", metaRouter);

app.use(notFound);
app.use(errorHandler);
