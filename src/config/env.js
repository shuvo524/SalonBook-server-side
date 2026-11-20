import "dotenv/config";

// Central environment configuration. Every secret comes from the
// environment — nothing sensitive is hard-coded anywhere in this project.

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || "development",
  mongoUri: process.env.MONGODB_URI || "",
  betterAuthSecret: process.env.BETTER_AUTH_SECRET || "",
  betterAuthUrl: process.env.BETTER_AUTH_URL || "http://localhost:5000",
  clientUrl: process.env.CLIENT_URL || "http://localhost:3000",
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  imgbbApiKey: process.env.IMGBB_API_KEY || "",
  cookieCrossSite: process.env.COOKIE_CROSS_SITE === "true",
};

// The server cannot run without these three, so fail fast with a clear
// message instead of crashing later with a confusing library error.
for (const name of ["MONGODB_URI", "BETTER_AUTH_SECRET", "JWT_SECRET"]) {
  required(name);
}

export function clientOrigins() {
  return config.clientUrl
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

// The first client origin — used for Stripe redirect URLs.
export function primaryClientOrigin() {
  return clientOrigins()[0] || "http://localhost:3000";
}
