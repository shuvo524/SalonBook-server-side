import mongoose from "mongoose";

// Suggested categories (from the assignment). They are suggestions, not a
// database enum — an admin may add a service under any category name.
export const SERVICE_CATEGORIES = [
  "Haircut & Styling",
  "Hair Coloring",
  "Hair Treatment",
  "Facial & Skincare",
  "Makeup",
  "Manicure & Pedicure",
  "Spa & Massage",
];

const serviceSchema = new mongoose.Schema(
  {
    serviceName: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    price: {
      type: Number,
      required: true,
      min: [0.01, "Price must be a positive number."],
    },
    duration: {
      type: Number,
      required: true,
      min: [1, "Duration must be a positive number."],
    },
    image: { type: String, required: true },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true }
);

serviceSchema.set("toJSON", {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

export const Service =
  mongoose.models.Service || mongoose.model("Service", serviceSchema);
