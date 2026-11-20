import express from "express";
import { Appointment } from "../models/Appointment.js";
import { Service } from "../models/Service.js";
import { TIME_SLOTS } from "../config/timeSlots.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  asyncHandler,
  httpError,
  isValidDateString,
  isValidObjectId,
  sendSuccess,
  todayDhaka,
} from "../utils/helpers.js";

const router = express.Router();
const customerOnly = [authenticate, requireRole("customer")];
const adminOnly = [authenticate, requireRole("admin")];

const serviceFields = "serviceName image category price duration status";
const customerFields = "name email image phone";

// POST /api/appointments — customer only. Books one service for a date +
// time slot. Rules: the service must be active, the date must not be in
// the past, and the service/date/slot must not already have an active
// (pending or confirmed) booking — a salon chair is taken once.
router.post(
  "/",
  ...customerOnly,
  asyncHandler(async (req, res) => {
    const { serviceId, appointmentDate, timeSlot, message } = req.body;

    if (!serviceId || !isValidObjectId(serviceId)) {
      throw httpError(400, "A valid service is required.");
    }
    if (!isValidDateString(appointmentDate)) {
      throw httpError(
        400,
        "Appointment date must be a valid date (YYYY-MM-DD)."
      );
    }
    if (appointmentDate < todayDhaka()) {
      throw httpError(400, "Appointment date cannot be in the past.");
    }
    if (!TIME_SLOTS.includes(timeSlot)) {
      throw httpError(400, "Please choose a valid time slot.");
    }

    const service = await Service.findById(serviceId);
    if (!service) throw httpError(404, "Service not found.");
    if (service.status !== "active") {
      throw httpError(
        400,
        "This service is currently unavailable for booking."
      );
    }

    const clash = await Appointment.findOne({
      serviceId: service._id,
      appointmentDate,
      timeSlot,
      status: { $in: ["pending", "confirmed"] },
    });
    if (clash) {
      throw httpError(
        409,
        "This time slot is already booked for that service. Please choose another slot."
      );
    }

    // The findOne check above gives the friendly error; the unique partial
    // index on the model is the race-safe backstop — if two requests for
    // the same slot arrive at once, the loser hits a duplicate-key error
    // here and gets the same 409.
    let appointment;
    try {
      appointment = await Appointment.create({
        serviceId: service._id,
        customerId: req.user.id,
        appointmentDate,
        timeSlot,
        message: typeof message === "string" ? message.trim() : "",
        servicePrice: service.price,
      });
    } catch (error) {
      if (error?.code === 11000) {
        throw httpError(
          409,
          "This time slot is already booked for that service. Please choose another slot."
        );
      }
      throw error;
    }

    await appointment.populate("serviceId", serviceFields);
    return sendSuccess(res, { appointment }, 201);
  })
);

// GET /api/appointments/my — customer. Only their own appointments,
// newest first. Optional ?status=pending|confirmed|cancelled filter.
router.get(
  "/my",
  ...customerOnly,
  asyncHandler(async (req, res) => {
    const filter = { customerId: req.user.id };
    if (["pending", "confirmed", "cancelled"].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    const appointments = await Appointment.find(filter)
      .populate("serviceId", serviceFields)
      .sort({ createdAt: -1 });
    return sendSuccess(res, { appointments });
  })
);

// GET /api/appointments — admin. Every appointment, with service and
// customer details. Optional ?status= and ?paymentStatus= filters.
router.get(
  "/",
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const filter = {};
    if (["pending", "confirmed", "cancelled"].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (["unpaid", "paid"].includes(req.query.paymentStatus)) {
      filter.paymentStatus = req.query.paymentStatus;
    }
    const appointments = await Appointment.find(filter)
      .populate("serviceId", serviceFields)
      .populate("customerId", customerFields)
      .sort({ createdAt: -1 });
    return sendSuccess(res, { appointments });
  })
);

// GET /api/appointments/:id — the owning customer or any admin.
router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
      throw httpError(400, "Invalid appointment id.");
    }
    const appointment = await Appointment.findById(req.params.id)
      .populate("serviceId", serviceFields)
      .populate("customerId", customerFields);
    if (!appointment) throw httpError(404, "Appointment not found.");
    // customerId is a populated user document when the user exists, and
    // the raw id string otherwise — normalise before comparing.
    const ownerId = appointment.customerId?._id
      ? String(appointment.customerId._id)
      : String(appointment.customerId);
    if (req.user.role !== "admin" && ownerId !== req.user.id) {
      throw httpError(403, "You can only view your own appointments.");
    }
    return sendSuccess(res, { appointment });
  })
);

// PATCH /api/appointments/:id/cancel — customer. Only their own PENDING
// appointments can be cancelled by the customer.
router.patch(
  "/:id/cancel",
  ...customerOnly,
  asyncHandler(async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
      throw httpError(400, "Invalid appointment id.");
    }
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      customerId: req.user.id,
    });
    if (!appointment) throw httpError(404, "Appointment not found.");
    if (appointment.status !== "pending") {
      throw httpError(
        400,
        `Only pending appointments can be cancelled (this one is ${appointment.status}).`
      );
    }
    appointment.status = "cancelled";
    await appointment.save();
    await appointment.populate("serviceId", serviceFields);
    return sendSuccess(res, { appointment });
  })
);

// PATCH /api/appointments/:id/confirm — admin. Only PENDING appointments
// can be confirmed.
router.patch(
  "/:id/confirm",
  ...adminOnly,
  asyncHandler(async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
      throw httpError(400, "Invalid appointment id.");
    }
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) throw httpError(404, "Appointment not found.");
    if (appointment.status !== "pending") {
      throw httpError(
        400,
        `Only pending appointments can be confirmed (this one is ${appointment.status}).`
      );
    }
    appointment.status = "confirmed";
    await appointment.save();
    await appointment.populate("serviceId", serviceFields);
    await appointment.populate("customerId", customerFields);
    return sendSuccess(res, { appointment });
  })
);

// PATCH /api/appointments/:id/cancel-admin — admin. Pending or confirmed
// appointments can be cancelled. Cancelling never changes the payment
// status: a paid appointment stays paid in the records (refunds are a
// separate, manual process outside this API).
router.patch(
  "/:id/cancel-admin",
  ...adminOnly,
  asyncHandler(async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
      throw httpError(400, "Invalid appointment id.");
    }
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) throw httpError(404, "Appointment not found.");
    if (appointment.status === "cancelled") {
      throw httpError(400, "This appointment is already cancelled.");
    }
    appointment.status = "cancelled";
    await appointment.save();
    await appointment.populate("serviceId", serviceFields);
    await appointment.populate("customerId", customerFields);
    return sendSuccess(res, { appointment });
  })
);

export default router;
