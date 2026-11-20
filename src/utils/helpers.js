import mongoose from "mongoose";

// Wrap an async route handler so rejected promises reach the error handler.
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Error with an HTTP status, handled by the central error middleware.
export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// Parse a value as a positive number, or return null when it is not one.
export function parsePositiveNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

// Escape user input before using it in a RegExp ($regex search).
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// True only for a real calendar date in YYYY-MM-DD form — the format
// regex alone would accept impossible dates such as 2026-13-99.
export function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// Today's date (YYYY-MM-DD) in the salon's timezone, Asia/Dhaka. Used to
// reject appointment dates in the past.
export function todayDhaka() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Response shape: every API response carries `success` plus either `data`
// or `message`, so the client has one shape to handle.
export function sendSuccess(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}
