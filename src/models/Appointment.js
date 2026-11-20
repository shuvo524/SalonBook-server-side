import mongoose from "mongoose";
import { TIME_SLOTS } from "../config/timeSlots.js";

const appointmentSchema = new mongoose.Schema(
  {
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    // Better Auth user id (a string, not an ObjectId).
    customerId: { type: String, ref: "User", required: true, index: true },
    // Stored as a YYYY-MM-DD string so date + slot lookups are exact.
    appointmentDate: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD."],
    },
    timeSlot: { type: String, required: true, enum: TIME_SLOTS },
    message: { type: String, default: "", trim: true, maxlength: 500 },
    // Price snapshot from the service at booking time, so later price
    // changes never rewrite what a customer agreed to pay.
    servicePrice: { type: Number, required: true, min: 0 },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

// Duplicate-booking guard, enforced by the database itself: one service
// can have only one ACTIVE (pending or confirmed) booking per date + slot.
// The route also checks first for a friendly error message, but only this
// unique partial index is race-safe — two simultaneous requests for the
// same slot cannot both slip through. Cancelled bookings do not block
// the slot, so it can be booked again after a cancellation.
appointmentSchema.index(
  { serviceId: 1, appointmentDate: 1, timeSlot: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["pending", "confirmed"] } },
  }
);

appointmentSchema.set("toJSON", {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

export const Appointment =
  mongoose.models.Appointment ||
  mongoose.model("Appointment", appointmentSchema);
