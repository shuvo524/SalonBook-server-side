// Make an existing user an admin (or demote one back to customer).
// Admin accounts must NOT be creatable through public registration, so this
// script is the only way to grant the admin role.
//
// Usage:
//   node scripts/promote-admin.js user@example.com
//   node scripts/promote-admin.js user@example.com --demote
//
// The user must already exist — sign them up through the app first.
import { connectDB, disconnectDB } from "../src/config/db.js";
import { User } from "../src/models/User.js";

const email = process.argv[2];
const demote = process.argv.includes("--demote");

if (!email || email.startsWith("--")) {
  console.error(
    "Usage: node scripts/promote-admin.js <email> [--demote]"
  );
  process.exit(1);
}

try {
  await connectDB();
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    console.error(`No user found with email ${email}. Sign them up first.`);
    process.exitCode = 1;
  } else {
    user.role = demote ? "customer" : "admin";
    await user.save();
    console.log(
      `${user.email} is now ${demote ? "a customer" : "an admin"}.`
    );
  }
} catch (error) {
  console.error("Failed:", error.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
