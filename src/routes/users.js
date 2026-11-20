import express from "express";
import { User, publicUser } from "../models/User.js";
import { Appointment } from "../models/Appointment.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { asyncHandler, httpError, sendSuccess } from "../utils/helpers.js";

const router = express.Router();
const adminOnly = [authenticate, requireRole("admin")];

// GET /api/users — admin. All registered users, newest first.
// Optional ?role=customer|admin filter.
router.get(
  "/",
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const filter = {};
    if (["customer", "admin"].includes(req.query.role)) {
      filter.role = req.query.role;
    }
    const users = await User.find(filter).sort({ createdAt: -1 }).lean();
    return sendSuccess(res, { users: users.map(publicUser) });
  })
);

// GET /api/users/:id — admin. User details plus their appointment counts.
router.get(
  "/:id",
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).lean();
    if (!user) throw httpError(404, "User not found.");

    const [total, pending, confirmed, cancelled] = await Promise.all([
      Appointment.countDocuments({ customerId: user._id }),
      Appointment.countDocuments({ customerId: user._id, status: "pending" }),
      Appointment.countDocuments({
        customerId: user._id,
        status: "confirmed",
      }),
      Appointment.countDocuments({
        customerId: user._id,
        status: "cancelled",
      }),
    ]);

    return sendSuccess(res, {
      user: publicUser(user),
      appointments: { total, pending, confirmed, cancelled },
    });
  })
);

// PATCH /api/users/:id/block — admin. { isBlocked: true | false }
// Blocked users are rejected from every protected route by the auth
// middleware. An admin cannot block themselves or another admin.
router.patch(
  "/:id/block",
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const { isBlocked } = req.body;
    if (typeof isBlocked !== "boolean") {
      throw httpError(400, "isBlocked must be true or false.");
    }
    const user = await User.findById(req.params.id);
    if (!user) throw httpError(404, "User not found.");
    if (String(user._id) === req.user.id) {
      throw httpError(400, "You cannot block your own account.");
    }
    if (user.role === "admin") {
      throw httpError(400, "Admin accounts cannot be blocked.");
    }
    user.isBlocked = isBlocked;
    await user.save();
    return sendSuccess(res, { user: publicUser(user) });
  })
);

export default router;
