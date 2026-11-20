import mongoose from "mongoose";
import { MongoClient } from "mongodb";
import { config } from "./env.js";

// Native driver client for Better Auth's MongoDB adapter. The Db handle is
// usable before connecting — the driver connects lazily on first use — so
// it is safe to create at module load. It uses the database named in
// MONGODB_URI, the same database Mongoose connects to below.
export const mongoClient = new MongoClient(config.mongoUri);
export const nativeDb = mongoClient.db();

// Indexes Better Auth builds lazily in the background (better-auth
// 1.7.x, @better-auth/mongo-adapter). They are created here, awaited,
// BEFORE the server starts listening: the adapter fires these builds
// fire-and-forget at import time, so on a fresh database the first
// sign-up can race with a still-running build and MongoDB rejects the
// write with "Unable to write to collection ... due to catalog changes".
// createIndex is idempotent for an identical spec, so this is a no-op
// once the indexes exist, and the adapter's own background builds then
// find them already in place. If creation fails (e.g. the DB user lacks
// createIndex) we log and continue — Better Auth degrades the same way,
// and the race then only affects the first seconds of a fresh database.
const AUTH_INDEXES = [
  { collection: "user", key: { email: 1 }, options: { name: "user_email_uidx", unique: true } },
  { collection: "session", key: { token: 1 }, options: { name: "session_token_uidx", unique: true } },
  { collection: "account", key: { userId: 1 }, options: { name: "account_userId_idx" } },
  { collection: "verification", key: { identifier: 1 }, options: { name: "verification_identifier_idx" } },
];

async function ensureAuthIndexes() {
  try {
    for (const { collection, key, options } of AUTH_INDEXES) {
      await nativeDb.collection(collection).createIndex(key, options);
    }
  } catch (err) {
    console.warn("Could not create auth indexes (continuing):", err.message);
  }
}

export async function connectDB() {
  await mongoose.connect(config.mongoUri);
  await mongoClient.connect();
  await ensureAuthIndexes();
  console.log("MongoDB connected");
}

export async function disconnectDB() {
  await mongoose.disconnect();
  await mongoClient.close();
}
