import mongoose from "mongoose";

// Payment history. Records are created ONLY by the verified Stripe webhook
// — there is no API endpoint that creates or edits a transaction, so an
// admin can never manually mark a payment as successful.
const transactionSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: true,
    },
    customerId: { type: String, ref: "User", required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, lowercase: true },
    // Unique: the webhook is idempotent — Stripe may deliver the same event
    // twice, and the second delivery must not create a second record.
    stripeSessionId: { type: String, required: true, unique: true },
    status: { type: String, enum: ["paid", "failed"], required: true },
  },
  { timestamps: true }
);

transactionSchema.set("toJSON", {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

export const Transaction =
  mongoose.models.Transaction ||
  mongoose.model("Transaction", transactionSchema);
