import { app } from "./app.js";
import { config } from "./config/env.js";
import { connectDB } from "./config/db.js";

async function start() {
  await connectDB();
  app.listen(config.port, () => {
    console.log(`SalonBook server running on port ${config.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
