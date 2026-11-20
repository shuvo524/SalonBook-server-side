import express from "express";
import { Appointment } from "../models/Appointment.js";
import { Transaction } from "../models/Transaction.js";
import { getStripe } from "../lib/stripe.js";
import { config, primaryClientOrigin } from "../config/env.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  asyncHandler,
  httpError,
  isValidObjectId,
  sendSuccess,
} from "../utils/helpers.js";

const router = express.Router();

// POST /api/payments/checkout/:appointmentId — customer. Creates a Stripe
// Checkout session for one CONFIRMED and still-unpaid appointment owned by
// the caller. Pending or cancelled appointments cannot be paid.
router.post(
  "/checkout/:appointmentId",
  authenticate,
  requireRole("customer"),
  asyncHandler(async (req, res) => {
    const { appointmentId } = req.params;
    if (!isValidObjectId(appointmentId)) {
      throw httpError(400, "Invalid appointment id.");
    }

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      customerId: req.user.id,
    }).populate("serviceId", "serviceName");
    if (!appointment) throw httpError(404, "Appointment not found.");
    if (appointment.status !== "confirmed") {
      throw httpError(
        400,
        `Only confirmed appointments can be paid (this one is ${appointment.status}).`
      );
    }
    if (appointment.paymentStatus === "paid") {
      throw httpError(400, "This appointment is already paid.");
    }

    const stripe = getStripe();
    if (!stripe) {
      throw httpError(
        503,
        "Payments are not configured yet. Please try again later."
      );
    }

    const clientUrl = primaryClientOrigin();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(appointment.servicePrice * 100),
            product_data: {
              name:
                appointment.serviceId?.serviceName || "SalonBook appointment",
              description: `${appointment.appointmentDate} at ${appointment.timeSlot}`,
            },
          },
        },
      ],
      metadata: {
        appointmentId: String(appointment._id),
        customerId: String(appointment.customerId),
      },
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/payment/cancel`,
    });

    return sendSuccess(res, {
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  })
);

// GET /api/payments/transactions — admin. Every payment record, newest
// first. Optional ?status=paid|failed filter. Read-only: nothing here can
// change a payment's status.
router.get(
  "/transactions",
  authenticate,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const filter = {};
    if (["paid", "failed"].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    const transactions = await Transaction.find(filter)
      .populate({
        path: "appointmentId",
        select: "appointmentDate timeSlot servicePrice status",
        populate: { path: "serviceId", select: "serviceName" },
      })
      .populate("customerId", "name email")
      .sort({ createdAt: -1 });
    return sendSuccess(res, { transactions });
  })
);

// POST /api/payments/webhook — Stripe. Mounted separately in app.js with a
// raw body, BEFORE express.json().
//
// This is the ONLY place a payment status changes: the event signature is
// verified with STRIPE_WEBHOOK_SECRET first, and only a verified
// checkout.session.completed event with payment_status "paid" marks the
// appointment paid and creates the transaction. Re-deliveries of the same
// event are ignored (transactions are unique per Stripe session id).
export async function stripeWebhookHandler(req, res) {
  const stripe = getStripe();
  if (!stripe || !config.stripeWebhookSecret) {
    return res
      .status(503)
      .json({ success: false, message: "Stripe webhook is not configured." });
  }

  const signature = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      config.stripeWebhookSecret
    );
  } catch {
    return res
      .status(400)
      .json({ success: false, message: "Invalid webhook signature." });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const { appointmentId, customerId } = session.metadata || {};

      if (session.payment_status === "paid" && appointmentId) {
        // Idempotency: ignore this event if we already recorded it.
        const existing = await Transaction.findOne({
          stripeSessionId: session.id,
        });
        if (!existing) {
          const appointment = await Appointment.findById(appointmentId);
          if (appointment) {
            appointment.paymentStatus = "paid";
            await appointment.save();
            await Transaction.create({
              appointmentId: appointment._id,
              customerId: customerId || String(appointment.customerId),
              amount: (session.amount_total || 0) / 100,
              currency: session.currency || "usd",
              stripeSessionId: session.id,
              status: "paid",
            });
          }
        }
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object;
      const { appointmentId, customerId } = session.metadata || {};
      if (appointmentId) {
        const existing = await Transaction.findOne({
          stripeSessionId: session.id,
        });
        if (!existing) {
          await Transaction.create({
            appointmentId,
            customerId: customerId || "",
            amount: (session.amount_total || 0) / 100,
            currency: session.currency || "usd",
            stripeSessionId: session.id,
            status: "failed",
          });
        }
      }
    }
  } catch (error) {
    console.error("Stripe webhook processing failed:", error);
    return res
      .status(500)
      .json({ success: false, message: "Webhook processing failed." });
  }

  return res.json({ received: true });
}

export default router;
