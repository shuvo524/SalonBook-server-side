// Vercel serverless entry point.
//
// Local development still uses src/index.js (`npm start` / `node src/index.js`);
// this file only exists so the same Express app can run as a Vercel Function.
// The database connects once per serverless instance (module scope) —
// Mongoose and the native driver both reuse the open connection on warm
// invocations, and connectDB() itself is safe when already connected.
import { app } from "../src/app.js";
import { connectDB } from "../src/config/db.js";

await connectDB();

export default app;
