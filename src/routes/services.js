import express from "express";
import { Service } from "../models/Service.js";
import { Appointment } from "../models/Appointment.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { uploadImage } from "../middleware/upload.js";
import { uploadImageToImgBB } from "../lib/imgbb.js";
import {
  asyncHandler,
  escapeRegex,
  httpError,
  isValidObjectId,
  parsePositiveNumber,
  sendSuccess,
} from "../utils/helpers.js";

const router = express.Router();
const adminOnly = [authenticate, requireRole("admin")];

// Validate the service fields shared by create and update. On update every
// field is optional; on create all are required.
function validateServiceFields(body, { requireAll }) {
  const { serviceName, category, description, price, duration } = body;
  const fields = {};

  if (serviceName !== undefined) {
    if (typeof serviceName !== "string" || !serviceName.trim()) {
      throw httpError(400, "Service name is required.");
    }
    fields.serviceName = serviceName.trim();
  }
  if (category !== undefined) {
    if (typeof category !== "string" || !category.trim()) {
      throw httpError(400, "Category is required.");
    }
    fields.category = category.trim();
  }
  if (description !== undefined) {
    if (typeof description !== "string" || !description.trim()) {
      throw httpError(400, "Description is required.");
    }
    fields.description = description.trim();
  }
  if (price !== undefined) {
    const parsed = parsePositiveNumber(price);
    if (parsed === null) {
      throw httpError(400, "Price must be a positive number.");
    }
    fields.price = parsed;
  }
  if (duration !== undefined) {
    const parsed = parsePositiveNumber(duration);
    if (parsed === null || !Number.isInteger(parsed)) {
      throw httpError(400, "Duration must be a positive number of minutes.");
    }
    fields.duration = parsed;
  }

  if (requireAll) {
    for (const key of [
      "serviceName",
      "category",
      "description",
      "price",
      "duration",
    ]) {
      if (fields[key] === undefined) {
        throw httpError(400, `Missing required field: ${key}.`);
      }
    }
  }
  return fields;
}

// GET /api/services — public. Active services only, with search by name,
// category filter and sorting by price (the assignment's challenge
// requirements). ?search= &category= &sort=price_asc|price_desc|newest
// &page= &limit=
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { search, category, sort } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const filter = { status: "active" };
    if (search) {
      filter.serviceName = { $regex: escapeRegex(search), $options: "i" };
    }
    if (category) filter.category = category;

    let sortBy = { createdAt: -1 };
    if (sort === "price_asc") sortBy = { price: 1 };
    if (sort === "price_desc") sortBy = { price: -1 };

    const [services, total] = await Promise.all([
      Service.find(filter)
        .sort(sortBy)
        .skip((page - 1) * limit)
        .limit(limit),
      Service.countDocuments(filter),
    ]);

    return sendSuccess(res, {
      services,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  })
);

// GET /api/services/admin/all — admin. Every service, including inactive
// ones, for the Manage Services table. Registered before /:id.
router.get(
  "/admin/all",
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const services = await Service.find().sort({ createdAt: -1 });
    return sendSuccess(res, { services });
  })
);

// GET /api/services/:id — public, but only active services are shown. An
// inactive or missing service is a 404 either way.
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
      throw httpError(400, "Invalid service id.");
    }
    const service = await Service.findOne({
      _id: req.params.id,
      status: "active",
    });
    if (!service) {
      throw httpError(404, "Service not found or no longer available.");
    }
    return sendSuccess(res, { service });
  })
);

// POST /api/services — admin. Multipart form: service fields + image file.
// The image is uploaded to ImgBB; a plain image URL is not accepted.
router.post(
  "/",
  ...adminOnly,
  uploadImage,
  asyncHandler(async (req, res) => {
    const fields = validateServiceFields(req.body, { requireAll: true });
    if (!req.file) {
      throw httpError(400, "A service image is required.");
    }
    const image = await uploadImageToImgBB(
      req.file.buffer,
      req.file.originalname
    );
    const service = await Service.create({ ...fields, image });
    return sendSuccess(res, { service }, 201);
  })
);

// PUT /api/services/:id — admin. Any field may be updated; a new image file
// replaces the old one, otherwise the existing image is kept.
router.put(
  "/:id",
  ...adminOnly,
  uploadImage,
  asyncHandler(async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
      throw httpError(400, "Invalid service id.");
    }
    const fields = validateServiceFields(req.body, { requireAll: false });
    if (req.file) {
      fields.image = await uploadImageToImgBB(
        req.file.buffer,
        req.file.originalname
      );
    }
    const service = await Service.findByIdAndUpdate(req.params.id, fields, {
      new: true,
      runValidators: true,
    });
    if (!service) throw httpError(404, "Service not found.");
    return sendSuccess(res, { service });
  })
);

// PATCH /api/services/:id/status — admin. { status: "active" | "inactive" }
router.patch(
  "/:id/status",
  ...adminOnly,
  asyncHandler(async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
      throw httpError(400, "Invalid service id.");
    }
    const { status } = req.body;
    if (!["active", "inactive"].includes(status)) {
      throw httpError(400, 'Status must be "active" or "inactive".');
    }
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!service) throw httpError(404, "Service not found.");
    return sendSuccess(res, { service });
  })
);

// DELETE /api/services/:id — admin. A service with active (pending or
// confirmed) appointments cannot be deleted — deactivate it instead — so
// existing bookings never lose their service.
router.delete(
  "/:id",
  ...adminOnly,
  asyncHandler(async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
      throw httpError(400, "Invalid service id.");
    }
    const service = await Service.findById(req.params.id);
    if (!service) throw httpError(404, "Service not found.");

    const activeBookings = await Appointment.countDocuments({
      serviceId: service._id,
      status: { $in: ["pending", "confirmed"] },
    });
    if (activeBookings > 0) {
      throw httpError(
        400,
        "This service has active appointments. Deactivate it instead of deleting it."
      );
    }

    await Service.findByIdAndDelete(req.params.id);
    return sendSuccess(res, { deleted: true });
  })
);

export default router;
