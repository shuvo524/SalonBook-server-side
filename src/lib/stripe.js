import Stripe from "stripe";
import { config } from "../config/env.js";

// Lazy Stripe client: constructing it without a key would throw, and the
// server must still boot (and serve everything except payments) before the
// Stripe keys are configured. Routes return 503 when Stripe is not ready.
let stripeInstance = null;

export function getStripe() {
  if (!config.stripeSecretKey) return null;
  if (!stripeInstance) {
    stripeInstance = new Stripe(config.stripeSecretKey);
  }
  return stripeInstance;
}

export function isStripeConfigured() {
  return Boolean(config.stripeSecretKey && config.stripeWebhookSecret);
}
