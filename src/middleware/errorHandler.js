// 404 for unknown routes — always JSON, never an HTML page, so the
// client can show a proper message.
export function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

// Central error handler: every error in the API becomes one JSON shape.
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (process.env.NODE_ENV !== "test") {
    console.error(error);
  }

  // Mongoose validation (bad enum, negative price, bad date format...).
  if (error.name === "ValidationError") {
    const firstMessage = Object.values(error.errors)[0]?.message;
    return res.status(400).json({
      success: false,
      message: firstMessage || "Please check the submitted information.",
    });
  }

  // Bad ObjectId in a route parameter.
  if (error.name === "CastError") {
    return res
      .status(400)
      .json({ success: false, message: "Invalid id provided." });
  }

  // Duplicate key (e.g. a transaction for the same Stripe session).
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "This record already exists.",
    });
  }

  // Stripe errors (bad key, network failure...): the payment provider is
  // at fault, not the caller — report 502, never Stripe's own 401, which
  // would look like the user is not signed in.
  if (typeof error.type === "string" && error.type.startsWith("Stripe")) {
    return res.status(502).json({
      success: false,
      message:
        "The payment service is unavailable right now. Please try again later.",
    });
  }

  // Multer upload errors (file too large, wrong type...).
  if (error.name === "MulterError") {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Image is too large. Maximum size is 5 MB."
        : "Image upload failed. Please try a different image.";
    return res.status(400).json({ success: false, message });
  }

  const status = error.status || 500;
  return res.status(status).json({
    success: false,
    message: error.message || "Something went wrong. Please try again.",
  });
}
