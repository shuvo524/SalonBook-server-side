import { config } from "../config/env.js";

// Upload an image buffer to ImgBB and return its public URL.
// Uses the built-in fetch/FormData (Node 20+), no extra dependency.
export async function uploadImageToImgBB(buffer, filename) {
  if (!config.imgbbApiKey) {
    const error = new Error(
      "Image upload is not configured (IMGBB_API_KEY is missing)."
    );
    error.status = 503;
    throw error;
  }

  const form = new FormData();
  form.append("image", buffer.toString("base64"));
  if (filename) form.append("name", filename);

  const response = await fetch(
    `https://api.imgbb.com/1/upload?key=${config.imgbbApiKey}`,
    { method: "POST", body: form }
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.success) {
    const error = new Error(
      data?.error?.message || "Image upload failed. Please try again."
    );
    error.status = 502;
    throw error;
  }

  return data.data.url;
}
