import express from "express";
import { Appointment } from "../models/Appointment.js";
import { Service } from "../models/Service.js";
import { Transaction } from "../models/Transaction.js";
import { User } from "../models/User.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { asyncHandler, sendSuccess } from "../utils/helpers.js";

const router = express.Router();

// GET /api/dashboard/customer — the signed-in customer's overview stats
// plus their five most recent appointments.
router.get(
  "/customer",
  authenticate,
  requireRole("customer"),
  asyncHandler(async (req, res) => {
    const customerId = req.user.id;
    const [total, pending, confirmed, cancelled, paid, recent, spent] =
      await Promise.all([
        Appointment.countDocuments({ customerId }),
        Appointment.countDocuments({ customerId, status: "pending" }),
        Appointment.countDocuments({ customerId, status: "confirmed" }),
        Appointment.countDocuments({ customerId, status: "cancelled" }),
        Appointment.countDocuments({ customerId, paymentStatus: "paid" }),
        Appointment.find({ customerId })
          .populate("serviceId", "serviceName image category")
          .sort({ createdAt: -1 })
          .limit(5),
        Transaction.aggregate([
          { $match: { customerId, status: "paid" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
      ]);

    return sendSuccess(res, {
      stats: {
        totalAppointments: total,
        pendingAppointments: pending,
        confirmedAppointments: confirmed,
        cancelledAppointments: cancelled,
        paidAppointments: paid,
        totalSpent: spent[0]?.total || 0,
      },
      recentAppointments: recent,
    });
  })
);

// GET /api/dashboard/admin — the admin overview: customers, services,
// appointments and successful payments.
router.get(
  "/admin",
  authenticate,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const [
      totalCustomers,
      totalActiveServices,
      totalAppointments,
      pending,
      confirmed,
      successfulPayments,
      revenue,
      recentAppointments,
    ] = await Promise.all([
      User.countDocuments({ role: "customer" }),
      Service.countDocuments({ status: "active" }),
      Appointment.countDocuments(),
      Appointment.countDocuments({ status: "pending" }),
      Appointment.countDocuments({ status: "confirmed" }),
      Transaction.countDocuments({ status: "paid" }),
      Transaction.aggregate([
        { $match: { status: "paid" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Appointment.find()
        .populate("serviceId", "serviceName")
        .populate("customerId", "name email")
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

    return sendSuccess(res, {
      stats: {
        totalCustomers,
        totalActiveServices,
        totalAppointments,
        pendingAppointments: pending,
        confirmedAppointments: confirmed,
        totalSuccessfulPayments: successfulPayments,
        totalRevenue: revenue[0]?.total || 0,
      },
      recentAppointments,
    });
  })
);

export default router;
