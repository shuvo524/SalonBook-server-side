// Integration test for the SalonBook server. Run with `npm test`.
// Boots the real app against an in-memory MongoDB and exercises every
// route: auth, JWT exchange, services, appointments, payments (webhook
// with a self-signed Stripe event), users, profile, dashboards. The first
// run downloads a MongoDB binary (~50 MB), so it needs internet once;
// later runs reuse the cached binary. No real keys or databases are used.
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const execFileAsync = promisify(execFile);
const BASE = "http://127.0.0.1:5001";
let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, extra = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL ${name} ${extra}`);
  }
}

async function api(path, { method = "GET", token, cookie, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  const options = { method, headers };
  if (raw !== undefined) {
    options.body = raw;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json, text, setCookie: res.headers.getSetCookie() };
}

function cookiesToHeader(setCookie) {
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  // Single-node replica set (MongoMemoryReplSet), not a standalone
  // server: Better Auth wraps sign-up (user + account + session) in a
  // MongoDB transaction, and transactions require a replica set.
  // Production MongoDB Atlas is a replica set, so this matches
  // production — a standalone memory server fails every sign-up with
  // "Transaction numbers are only allowed on a replica set member or
  // mongos". Note: the replSet option must go to MongoMemoryReplSet;
  // MongoMemoryServer.create() ignores it and stays standalone.
  console.log("Starting in-memory MongoDB (single-node replica set)...");
  const mongod = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });
  const uri = mongod.getUri();

  process.env.MONGODB_URI = uri;
  process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-min-32-chars-long";
  process.env.JWT_SECRET = "test-jwt-secret-also-long-enough-123";
  process.env.BETTER_AUTH_URL = "http://127.0.0.1:5001";
  process.env.CLIENT_URL = "http://localhost:3000";
  process.env.PORT = "5001";
  process.env.STRIPE_SECRET_KEY = "sk_test_fakekey1234567890";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_testsecret123";
  process.env.NODE_ENV = "test";

  const { app } = await import("./src/app.js");
  const { connectDB, disconnectDB } = await import("./src/config/db.js");
  const { Service } = await import("./src/models/Service.js");
  const { User } = await import("./src/models/User.js");
  const { Appointment } = await import("./src/models/Appointment.js");
  const { Transaction } = await import("./src/models/Transaction.js");

  await connectDB();
  const server = app.listen(5001);
  await new Promise((resolve) => server.once("listening", resolve));
  console.log("Server up on 5001.\n");

  try {
    // --- Health & meta -------------------------------------------------
    let r = await api("/");
    check("GET / returns 200", r.status === 200 && r.json?.success === true);
    r = await api("/api/health");
    check("GET /api/health returns ok", r.status === 200 && r.json?.data?.status === "ok");
    r = await api("/api/meta/time-slots");
    check("GET /api/meta/time-slots returns 11 slots", r.status === 200 && r.json?.data?.timeSlots?.length === 11);
    r = await api("/api/meta/categories");
    check("GET /api/meta/categories returns 7 categories", r.status === 200 && r.json?.data?.categories?.length === 7);
    r = await api("/api/does-not-exist");
    check("Unknown route returns JSON 404", r.status === 404 && r.json?.success === false);

    // --- Sign up customer + JWT exchange -------------------------------
    r = await api("/api/auth/sign-up/email", {
      method: "POST",
      body: { name: "Test Customer", email: "customer@test.com", password: "Test123" },
    });
    check("Customer sign-up succeeds", r.status === 200 || r.status === 201, `got ${r.status}: ${r.text.slice(0, 200)}`);
    const customerCookie = cookiesToHeader(r.setCookie || []);
    check("Sign-up sets a session cookie", customerCookie.length > 0);

    r = await api("/api/auth/token", { method: "POST", cookie: customerCookie });
    check("POST /api/auth/token exchanges session for JWT", r.status === 200 && typeof r.json?.data?.token === "string", `got ${r.status}: ${r.text.slice(0, 200)}`);
    const customerToken = r.json?.data?.token;

    r = await api("/api/profile/me", { token: customerToken });
    check("Bearer JWT authenticates /api/profile/me", r.status === 200 && r.json?.data?.user?.role === "customer");
    r = await api("/api/profile/me");
    check("No auth -> 401", r.status === 401);
    r = await api("/api/profile/me", { token: "invalid.token.here" });
    check("Bad JWT -> 401", r.status === 401);
    r = await api("/api/profile/me", { cookie: customerCookie });
    check("Session cookie alone also authenticates", r.status === 200);

    // --- Password rules enforced by the SERVER --------------------------
    r = await api("/api/auth/sign-up/email", {
      method: "POST",
      body: { name: "Weak One", email: "weak1@test.com", password: "test123" },
    });
    check("Password without uppercase -> 400", r.status === 400, `got ${r.status}: ${r.text.slice(0, 200)}`);
    r = await api("/api/auth/sign-up/email", {
      method: "POST",
      body: { name: "Weak Two", email: "weak2@test.com", password: "TEST123" },
    });
    check("Password without lowercase -> 400", r.status === 400, `got ${r.status}: ${r.text.slice(0, 200)}`);
    r = await api("/api/auth/sign-up/email", {
      method: "POST",
      body: { name: "Weak Three", email: "weak3@test.com", password: "Test1" },
    });
    check("Password shorter than 6 chars -> 400", r.status === 400, `got ${r.status}: ${r.text.slice(0, 200)}`);

    // --- Role escalation attempt ---------------------------------------
    r = await api("/api/auth/sign-up/email", {
      method: "POST",
      body: { name: "Sneaky", email: "sneaky@test.com", password: "Test123", role: "admin" },
    });
    const sneakyCookie = cookiesToHeader(r.setCookie || []);
    r = await api("/api/auth/token", { method: "POST", cookie: sneakyCookie });
    check("Sign-up with role=admin does NOT create an admin", r.status === 200 && r.json?.data?.user?.role === "customer", `got ${r.status}: ${r.text.slice(0, 200)}`);

    // --- Admin user -----------------------------------------------------
    r = await api("/api/auth/sign-up/email", {
      method: "POST",
      body: { name: "Admin User", email: "admin@test.com", password: "Test123" },
    });
    const adminCookie = cookiesToHeader(r.setCookie || []);
    await User.updateOne({ email: "admin@test.com" }, { role: "admin" });
    r = await api("/api/auth/token", { method: "POST", cookie: adminCookie });
    const adminToken = r.json?.data?.token;
    check("Admin token issued with role admin", r.status === 200 && r.json?.data?.user?.role === "admin");

    // Second customer (for ownership checks)
    r = await api("/api/auth/sign-up/email", {
      method: "POST",
      body: { name: "Other Customer", email: "other@test.com", password: "Test123" },
    });
    const otherCookie = cookiesToHeader(r.setCookie || []);
    r = await api("/api/auth/token", { method: "POST", cookie: otherCookie });
    const otherToken = r.json?.data?.token;

    // --- Services -------------------------------------------------------
    r = await api("/api/services", { method: "POST", token: customerToken, body: { serviceName: "X" } });
    check("Customer cannot create services (403)", r.status === 403);
    r = await api("/api/services", { method: "POST", token: adminToken, body: { serviceName: "X" } });
    check("Admin create without image -> 400", r.status === 400);

    // Create services directly (ImgBB needs a real key; the upload path is
    // exercised separately for its validation).
    const svcA = await Service.create({ serviceName: "Alpha Cut", category: "Haircut & Styling", description: "A", price: 50, duration: 60, image: "https://example.com/a.jpg", status: "active" });
    const svcB = await Service.create({ serviceName: "Beta Facial", category: "Facial & Skincare", description: "B", price: 20, duration: 30, image: "https://example.com/b.jpg", status: "active" });
    const svcInactive = await Service.create({ serviceName: "Old Spa", category: "Spa & Massage", description: "C", price: 99, duration: 90, image: "https://example.com/c.jpg", status: "inactive" });

    r = await api("/api/services");
    check("Public list shows only active services", r.status === 200 && r.json?.data?.services?.length === 2);
    r = await api("/api/services?search=alpha");
    check("Search by name filters", r.status === 200 && r.json?.data?.services?.length === 1 && r.json.data.services[0].serviceName === "Alpha Cut");
    r = await api("/api/services?sort=price_asc");
    check("Sort price_asc orders correctly", r.status === 200 && r.json?.data?.services?.[0]?.price === 20);
    r = await api("/api/services?sort=price_desc");
    check("Sort price_desc orders correctly", r.status === 200 && r.json?.data?.services?.[0]?.price === 50);
    r = await api("/api/services?category=Facial%20%26%20Skincare");
    check("Category filter works", r.status === 200 && r.json?.data?.services?.length === 1);
    r = await api(`/api/services/${svcInactive._id}`);
    check("Inactive service id -> 404", r.status === 404);
    r = await api(`/api/services/${svcA._id}`);
    check("Active service detail -> 200", r.status === 200 && r.json?.data?.service?.serviceName === "Alpha Cut");
    r = await api("/api/services/not-an-id");
    check("Invalid service id -> 400", r.status === 400);
    r = await api("/api/services/admin/all", { token: adminToken });
    check("Admin list includes inactive (3)", r.status === 200 && r.json?.data?.services?.length === 3);
    r = await api("/api/services/admin/all", { token: customerToken });
    check("Customer cannot list admin services (403)", r.status === 403);

    // Non-image upload rejected by multer filter (no ImgBB key needed).
    const form = new FormData();
    form.append("serviceName", "Bad");
    form.append("category", "Makeup");
    form.append("description", "Bad");
    form.append("price", "10");
    form.append("duration", "30");
    form.append("image", new Blob(["not an image"], { type: "text/plain" }), "note.txt");
    const upRes = await fetch(`${BASE}/api/services`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}` }, body: form });
    check("Non-image file rejected (400)", upRes.status === 400, `got ${upRes.status}`);

    // --- Appointments ---------------------------------------------------
    const future = "2099-01-15";
    r = await api("/api/appointments", { method: "POST", token: adminToken, body: { serviceId: String(svcA._id), appointmentDate: future, timeSlot: "10:00 AM" } });
    check("Admin cannot book appointments (403)", r.status === 403);
    r = await api("/api/appointments", { method: "POST", token: customerToken, body: { serviceId: String(svcA._id), appointmentDate: future, timeSlot: "10:00 AM", message: "Please be gentle" } });
    check("Customer books appointment (201)", r.status === 201 && r.json?.data?.appointment?.status === "pending" && r.json?.data?.appointment?.paymentStatus === "unpaid", `got ${r.status}: ${r.text.slice(0, 200)}`);
    const appt1 = r.json?.data?.appointment;
    check("Price snapshotted from service", appt1?.servicePrice === 50);
    r = await api("/api/appointments", { method: "POST", token: otherToken, body: { serviceId: String(svcA._id), appointmentDate: future, timeSlot: "10:00 AM" } });
    check("Duplicate slot booking -> 409", r.status === 409);
    r = await api("/api/appointments", { method: "POST", token: customerToken, body: { serviceId: String(svcA._id), appointmentDate: "2020-01-01", timeSlot: "10:00 AM" } });
    check("Past date -> 400", r.status === 400);
    r = await api("/api/appointments", { method: "POST", token: customerToken, body: { serviceId: String(svcA._id), appointmentDate: "2026-13-99", timeSlot: "10:00 AM" } });
    check("Impossible calendar date -> 400", r.status === 400);
    r = await api("/api/appointments", { method: "POST", token: customerToken, body: { serviceId: String(svcA._id), appointmentDate: future, timeSlot: "03:33 AM" } });
    check("Invalid slot -> 400", r.status === 400);
    r = await api("/api/appointments", { method: "POST", token: customerToken, body: { serviceId: String(svcInactive._id), appointmentDate: future, timeSlot: "11:00 AM" } });
    check("Inactive service booking -> 400", r.status === 400);

    r = await api("/api/appointments/my", { token: customerToken });
    check("My appointments lists own only", r.status === 200 && r.json?.data?.appointments?.length === 1);
    r = await api(`/api/appointments/${appt1.id}`, { token: otherToken });
    check("Other customer cannot view appointment (403)", r.status === 403);
    r = await api(`/api/appointments/${appt1.id}`, { token: adminToken });
    check("Admin can view any appointment", r.status === 200);

    r = await api(`/api/appointments/${appt1.id}/cancel`, { method: "PATCH", token: customerToken });
    check("Customer cancels own pending appointment", r.status === 200 && r.json?.data?.appointment?.status === "cancelled");
    r = await api(`/api/appointments/${appt1.id}/cancel`, { method: "PATCH", token: customerToken });
    check("Cancel already-cancelled -> 400", r.status === 400);

    // Re-book the freed slot, then confirm it.
    r = await api("/api/appointments", { method: "POST", token: customerToken, body: { serviceId: String(svcA._id), appointmentDate: future, timeSlot: "10:00 AM" } });
    check("Freed slot can be booked again", r.status === 201);
    const appt2 = r.json?.data?.appointment;
    r = await api(`/api/appointments/${appt2.id}/confirm`, { method: "PATCH", token: adminToken });
    check("Admin confirms pending appointment", r.status === 200 && r.json?.data?.appointment?.status === "confirmed");
    r = await api(`/api/appointments/${appt2.id}/confirm`, { method: "PATCH", token: adminToken });
    check("Confirm already-confirmed -> 400", r.status === 400);
    r = await api(`/api/appointments/${appt2.id}/cancel`, { method: "PATCH", token: customerToken });
    check("Customer cannot cancel confirmed appointment (400)", r.status === 400);

    // --- Payments -------------------------------------------------------
    // Pending appointment cannot be paid.
    r = await api("/api/appointments", { method: "POST", token: customerToken, body: { serviceId: String(svcB._id), appointmentDate: future, timeSlot: "11:00 AM" } });
    const apptPending = r.json?.data?.appointment;
    r = await api(`/api/payments/checkout/${apptPending.id}`, { method: "POST", token: customerToken });
    check("Checkout for pending appointment -> 400", r.status === 400);
    // Confirmed appointment: fake Stripe key -> 502 from the provider (the
    // route wiring + validation passed; real keys are needed for a session).
    r = await api(`/api/payments/checkout/${appt2.id}`, { method: "POST", token: customerToken });
    check("Checkout reaches Stripe and fails cleanly with fake key (502)", r.status === 502, `got ${r.status}: ${r.text.slice(0, 200)}`);
    r = await api(`/api/payments/checkout/${appt2.id}`, { method: "POST", token: otherToken });
    check("Checkout for someone else's appointment -> 404", r.status === 404);

    // Webhook: self-signed test event (offline-safe).
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe("sk_test_fakekey1234567890");
    const customer = await User.findOne({ email: "customer@test.com" }).lean();
    const payload = JSON.stringify({
      id: "evt_test_completed",
      object: "event",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_123", object: "checkout.session", amount_total: 5000, currency: "usd", payment_status: "paid", metadata: { appointmentId: appt2.id, customerId: String(customer._id) } } },
    });
    // Stripe SDK v17 takes one options object, not (payload, secret).
    const sig = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_testsecret123",
    });
    const whRes = await fetch(`${BASE}/api/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": sig }, body: payload });
    check("Verified webhook accepted (200)", whRes.status === 200, `got ${whRes.status}`);
    const paidAppt = await Appointment.findById(appt2.id).lean();
    check("Webhook marks appointment paid", paidAppt?.paymentStatus === "paid");
    const txns = await Transaction.find({ stripeSessionId: "cs_test_123" }).lean();
    check("Webhook creates exactly one transaction", txns.length === 1 && txns[0].status === "paid" && txns[0].amount === 50 && txns[0].currency === "usd");
    const whRes2 = await fetch(`${BASE}/api/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": sig }, body: payload });
    const txns2 = await Transaction.find({ stripeSessionId: "cs_test_123" }).lean();
    check("Re-delivered webhook is idempotent (still 1 txn)", whRes2.status === 200 && txns2.length === 1);
    const badSig = await fetch(`${BASE}/api/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": "t=1,v1=bad" }, body: payload });
    check("Bad webhook signature -> 400", badSig.status === 400);

    r = await api(`/api/payments/checkout/${appt2.id}`, { method: "POST", token: customerToken });
    check("Checkout for paid appointment -> 400", r.status === 400);
    r = await api("/api/payments/transactions", { token: adminToken });
    check("Admin lists transactions", r.status === 200 && r.json?.data?.transactions?.length === 1);
    r = await api("/api/payments/transactions", { token: customerToken });
    check("Customer cannot list transactions (403)", r.status === 403);
    r = await api("/api/payments/transactions/my", { token: customerToken });
    check("Customer lists own payment history", r.status === 200 && r.json?.data?.transactions?.length === 1 && r.json.data.transactions[0].status === "paid");
    r = await api("/api/payments/transactions/my", { token: otherToken });
    check("Other customer sees no transactions of theirs", r.status === 200 && r.json?.data?.transactions?.length === 0);
    r = await api("/api/payments/transactions/my", { token: adminToken });
    check("Admin cannot use customer payment history (403)", r.status === 403);

    // Expired checkout session without a customerId in metadata: the
    // webhook must resolve the owner from the appointment and record a
    // failed transaction instead of crashing (500).
    const expiredPayload = JSON.stringify({
      id: "evt_test_expired",
      object: "event",
      type: "checkout.session.expired",
      data: { object: { id: "cs_test_expired", object: "checkout.session", amount_total: 2000, currency: "usd", metadata: { appointmentId: apptPending.id } } },
    });
    const expiredSig = stripe.webhooks.generateTestHeaderString({
      payload: expiredPayload,
      secret: "whsec_testsecret123",
    });
    const expiredRes = await fetch(`${BASE}/api/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": expiredSig }, body: expiredPayload });
    check("Expired-session webhook accepted (200)", expiredRes.status === 200, `got ${expiredRes.status}`);
    const failedTxns = await Transaction.find({ stripeSessionId: "cs_test_expired" }).lean();
    check("Expired session records one failed transaction", failedTxns.length === 1 && failedTxns[0].status === "failed" && String(failedTxns[0].customerId) === String(customer._id));

    // Admin cancels the paid+confirmed appointment; payment stays paid.
    r = await api(`/api/appointments/${appt2.id}/cancel-admin`, { method: "PATCH", token: adminToken });
    check("Admin cancels confirmed appointment", r.status === 200 && r.json?.data?.appointment?.status === "cancelled");
    const cancelledPaid = await Appointment.findById(appt2.id).lean();
    check("Cancelled appointment keeps paymentStatus paid", cancelledPaid?.paymentStatus === "paid");

    // --- Users & blocking ------------------------------------------------
    r = await api("/api/users", { token: adminToken });
    check("Admin lists users", r.status === 200 && r.json?.data?.users?.length >= 4);
    r = await api("/api/users", { token: customerToken });
    check("Customer cannot list users (403)", r.status === 403);
    r = await api(`/api/users/${customer._id}`, { token: adminToken });
    check("Admin views user details with counts", r.status === 200 && r.json?.data?.appointments?.total >= 2);
    r = await api(`/api/users/${customer._id}/block`, { method: "PATCH", token: adminToken, body: { isBlocked: true } });
    check("Admin blocks customer", r.status === 200 && r.json?.data?.user?.isBlocked === true);
    r = await api("/api/profile/me", { token: customerToken });
    check("Blocked user rejected from protected routes (403)", r.status === 403);
    r = await api(`/api/users/${customer._id}/block`, { method: "PATCH", token: adminToken, body: { isBlocked: false } });
    check("Admin unblocks customer", r.status === 200 && r.json?.data?.user?.isBlocked === false);
    r = await api("/api/profile/me", { token: customerToken });
    check("Unblocked user works again", r.status === 200);

    // --- Profile ----------------------------------------------------------
    r = await api("/api/profile/me", { method: "PATCH", token: customerToken, body: { role: "admin" } });
    check("Profile update with role -> 400", r.status === 400);
    r = await api("/api/profile/me", { method: "PATCH", token: customerToken, body: { name: "New Name", phone: "01700000000" } });
    check("Profile update works", r.status === 200 && r.json?.data?.user?.name === "New Name" && r.json?.data?.user?.phone === "01700000000");
    r = await api("/api/profile/me", { method: "PATCH", token: customerToken, body: { image: "not-a-url" } });
    check("Profile image must be a valid URL (400)", r.status === 400);
    r = await api("/api/profile/me", { method: "PATCH", token: customerToken, body: { image: "https://example.com/avatar.jpg" } });
    check("Profile image URL update works", r.status === 200 && r.json?.data?.user?.image === "https://example.com/avatar.jpg");

    // --- Dashboards --------------------------------------------------------
    r = await api("/api/dashboard/customer", { token: customerToken });
    check("Customer dashboard stats", r.status === 200 && r.json?.data?.stats?.totalAppointments >= 3 && r.json?.data?.stats?.totalSpent === 50, `got ${r.text.slice(0, 200)}`);
    r = await api("/api/dashboard/admin", { token: customerToken });
    check("Customer cannot view admin dashboard (403)", r.status === 403);
    r = await api("/api/dashboard/admin", { token: adminToken });
    check("Admin dashboard stats", r.status === 200 && r.json?.data?.stats?.totalCustomers >= 3 && r.json?.data?.stats?.totalSuccessfulPayments === 1);

    // --- Service status toggle + delete rules -------------------------------
    r = await api(`/api/services/${svcB._id}/status`, { method: "PATCH", token: adminToken, body: { status: "inactive" } });
    check("Admin deactivates service", r.status === 200 && r.json?.data?.service?.status === "inactive");
    r = await api(`/api/services/${svcB._id}`, { method: "PUT", token: adminToken, body: { status: "active", price: 22 } });
    check("PUT updates status and price", r.status === 200 && r.json?.data?.service?.status === "active" && r.json?.data?.service?.price === 22, `got ${r.status}: ${r.text.slice(0, 200)}`);
    r = await api(`/api/services/${svcB._id}`, { method: "PUT", token: adminToken, body: {} });
    check("PUT with no changes -> 400", r.status === 400);
    r = await api(`/api/services/${svcB._id}`, { method: "PUT", token: adminToken, body: { price: -5 } });
    check("PUT with negative price -> 400", r.status === 400);
    r = await api(`/api/services/${svcB._id}`, { method: "DELETE", token: adminToken });
    check("Delete blocked while service has active appointments (400)", r.status === 400);
    const svcFree = await Service.create({ serviceName: "Free Service", category: "Makeup", description: "D", price: 10, duration: 15, image: "https://example.com/d.jpg", status: "active" });
    r = await api(`/api/services/${svcFree._id}`, { method: "DELETE", token: adminToken });
    check("Delete service with no appointments works", r.status === 200);

    // --- Scripts (seed + promote-admin) --------------------------------------
    const scriptEnv = { ...process.env, MONGODB_URI: uri };
    const seedOut = await execFileAsync("node", ["scripts/seed-services.js"], { cwd: projectRoot, env: scriptEnv });
    check("Seed script runs (services already exist -> skips)", /already exist/.test(seedOut.stdout), seedOut.stdout.slice(0, 200));
    const seedForce = await execFileAsync("node", ["scripts/seed-services.js", "--force"], { cwd: projectRoot, env: scriptEnv });
    check("Seed --force inserts 8 services", /Seeded 8 services/.test(seedForce.stdout), seedForce.stdout.slice(0, 200));
    const promoteOut = await execFileAsync("node", ["scripts/promote-admin.js", "other@test.com"], { cwd: projectRoot, env: scriptEnv });
    check("promote-admin script works", /is now an admin/.test(promoteOut.stdout), promoteOut.stdout.slice(0, 200));
    const other = await User.findOne({ email: "other@test.com" }).lean();
    check("Promoted user has admin role in DB", other?.role === "admin");
  } finally {
    server.close();
    await disconnectDB();
    await mongod.stop();
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failures.length) console.log("Failures:\n- " + failures.join("\n- "));
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("Test crashed:", error);
  process.exit(1);
});
