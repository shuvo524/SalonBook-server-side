import mongoose from "mongoose";

// Mongoose view of the `user` collection that Better Auth manages.
// Better Auth uses STRING ids, so _id is a String here — with the default
// ObjectId type, lookups by Better Auth's ids would fail.
//
// Password hashes live in Better Auth's separate `account` collection, so
// nothing sensitive is ever in this model.
const userSchema = new mongoose.Schema(
  {
    _id: { type: String },
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    emailVerified: { type: Boolean, default: false },
    image: { type: String, default: null },
    phone: { type: String, default: null },
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    isBlocked: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "user" }
);

userSchema.set("toJSON", {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

export const User =
  mongoose.models.User || mongoose.model("User", userSchema);

// The safe public shape of a user — used by auth middleware and profile
// routes. Works for both Mongoose documents and lean objects.
export function publicUser(user) {
  if (!user) return null;
  const raw = typeof user.toObject === "function" ? user.toObject() : user;
  return {
    id: String(raw._id),
    name: raw.name,
    email: raw.email,
    image: raw.image || null,
    phone: raw.phone || null,
    role: raw.role,
    isBlocked: raw.isBlocked,
    createdAt: raw.createdAt,
  };
}
