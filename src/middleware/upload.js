import multer from "multer";

// Images are held in memory and forwarded to ImgBB — nothing is written to
// this server's disk.
const storage = multer.memoryStorage();

function imageOnly(req, file, cb) {
  if (!file.mimetype.startsWith("image/")) {
    const error = new Error("Only image files are allowed.");
    error.status = 400;
    return cb(error, false);
  }
  return cb(null, true);
}

// Single image upload, form field name "image", max 5 MB.
export const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageOnly,
}).single("image");
