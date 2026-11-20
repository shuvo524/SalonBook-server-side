import mongoose from "mongoose";
import { MongoClient } from "mongodb";
import { config } from "./env.js";

// Native driver client for Better Auth's MongoDB adapter. The Db handle is
// usable before connecting — the driver connects lazily on first use — so
// it is safe to create at module load. It uses the database named in
// MONGODB_URI, the same database Mongoose connects to below.
export const mongoClient = new MongoClient(config.mongoUri);
export const nativeDb = mongoClient.db();

export async function connectDB() {
  await mongoose.connect(config.mongoUri);
  await mongoClient.connect();
  console.log("MongoDB connected");
}

export async function disconnectDB() {
  await mongoose.disconnect();
  await mongoClient.close();
}
