# SalonBook API Contract

Reference for the client (Next.js) build. Base URL in development:
`http://localhost:5000`. In production: the deployed server URL.

## Response shape

Every response is JSON with `success`. Success responses carry `data`;
error responses carry `message`:

```json
{ "success": true, "data": { "...": "..." } }
{ "success": false, "message": "Please sign in to continue." }
```

Common HTTP statuses: `200` OK, `201` created, `400` bad input,
`401` not signed in / token invalid or expired, `403` wrong role or
blocked account, `404` not found, `409` conflict (slot already booked),
`502` image upload failed, `503` a service (Stripe / ImgBB) is not
configured.

All resources use `id` (never `_id`) in responses. Dates are
`YYYY-MM-DD` strings for appointments and ISO timestamps for `createdAt`.

## Authentication flow

1. **Sign up** — `POST /api/auth/sign-up/email`
   `{ name, email, password, image? }`. Password rules: minimum 6
   characters, at least one uppercase and one lowercase letter (enforced
   by the sign-up form; the server enforces the 6-character minimum).
   Every new account is a `customer` — sending `role: "admin"` is
   rejected. A session cookie is set on success.
2. **Sign in** — `POST /api/auth/sign-in/email` `{ email, password }`.
   Sets the session cookie.
3. **Google sign-in** — via the Better Auth client
   (`signIn.social({ provider: "google" })`), or
   `POST /api/auth/sign-in/social` `{ provider: "google", callbackURL }`.
4. **Get a JWT** — `POST /api/auth/token` (no body, cookie required).
   Returns `{ token, user }`. Store the token (e.g. `localStorage`) and
   send it as `Authorization: Bearer <token>` on every protected call.
   Tokens expire after `JWT_EXPIRES_IN` (default 7 days); on a `401`,
   send the user back to sign-in (or call this endpoint again while the
   session cookie is still valid).
5. **Sign out** — `POST /api/auth/sign-out` (cookie required), and delete
   the stored JWT on the client.
6. **Session check** — `GET /api/auth/get-session` (cookie required).

Protected routes also accept the session cookie alone (no Bearer token),
but the Bearer token is the recommended way.

## Better Auth endpoints (handled by the server)

| Method & path | Purpose |
| --- | --- |
| `POST /api/auth/sign-up/email` | Register with name, email, password, optional image URL |
| `POST /api/auth/sign-in/email` | Sign in with email + password |
| `POST /api/auth/sign-in/social` | Social sign-in (`{ provider: "google" }`) |
| `POST /api/auth/sign-out` | Sign out (clears the session) |
| `GET /api/auth/get-session` | Current session + user (cookie required) |
| `POST /api/auth/token` | Exchange the session for a JWT (this server's own route) |

## Public endpoints

### `GET /`
Health message. `GET /api/health` returns `{ success: true, status: "ok" }`.

### `GET /api/meta/time-slots`
`{ timeSlots: ["09:00 AM", "10:00 AM", ...] }` — the predefined booking
slots. Use this list in the booking form.

### `GET /api/meta/categories`
`{ categories: ["Haircut & Styling", "Hair Coloring", ...] }` — suggested
service categories for filters and the category section.

### `GET /api/services`
Active services only. Query params: `search` (service name, partial,
case-insensitive), `category` (exact name), `sort` (`price_asc`,
`price_desc`, or `newest` = default), `page` (default 1), `limit`
(default 50, max 100).

```json
{ "success": true, "data": {
  "services": [ { "id": "...", "serviceName": "Signature Haircut",
    "category": "Haircut & Styling", "description": "...", "price": 25,
    "duration": 45, "image": "https://...", "status": "active",
    "createdAt": "2026-11-20T..." } ],
  "pagination": { "page": 1, "limit": 50, "total": 8, "pages": 1 }
} }
```

### `GET /api/services/:id`
One active service: `{ service: {...} }`. `404` when the id is invalid,
missing, or the service is inactive.

## Services — admin only

All require a signed-in **admin** (`Authorization: Bearer <token>`).

### `GET /api/services/admin/all`
Every service including inactive ones: `{ services: [...] }`.

### `POST /api/services`
Multipart form (`Content-Type: multipart/form-data`):
`serviceName`, `category`, `description`, `price` (positive number),
`duration` (positive integer, minutes), `image` (file — required; the
server uploads it to ImgBB). Returns `201` with `{ service }`.

### `PUT /api/services/:id`
Multipart form; any field may be updated. A new `image` file replaces
the old one; without a file the image stays. Returns `{ service }`.

### `PATCH /api/services/:id/status`
JSON `{ status: "active" | "inactive" }`. Returns `{ service }`.

### `DELETE /api/services/:id`
Returns `{ deleted: true }`. Rejected with `400` when the service has
active (pending or confirmed) appointments — deactivate it instead.

## Appointments

### `POST /api/appointments` — customer
JSON: `{ serviceId, appointmentDate: "YYYY-MM-DD", timeSlot, message? }`.
`timeSlot` must be one of the values from `/api/meta/time-slots`.
Defaults: `status: "pending"`, `paymentStatus: "unpaid"`. The price is
snapshotted from the service, so later price changes do not affect the
booking. Returns `201` with `{ appointment }`.

Errors: `400` for a past date, an invalid slot, or an inactive service;
`409` when the service already has an active booking for that date and
slot (one chair, one booking — any customer).

```json
{ "id": "...", "serviceId": { "id": "...", "serviceName": "...",
  "image": "...", "category": "...", "price": 25, "duration": 45 },
  "customerId": "user-id", "appointmentDate": "2026-11-25",
  "timeSlot": "10:00 AM", "message": "...", "servicePrice": 25,
  "paymentStatus": "unpaid", "status": "pending",
  "createdAt": "2026-11-20T..." }
```

### `GET /api/appointments/my` — customer
Their own appointments, newest first, with service details.
Optional `?status=pending|confirmed|cancelled`.

### `GET /api/appointments` — admin
All appointments with service and customer details.
Optional `?status=` and `?paymentStatus=unpaid|paid` filters.

### `GET /api/appointments/:id` — owning customer or admin
`{ appointment }` with service and customer details.

### `PATCH /api/appointments/:id/cancel` — customer
Cancels their own **pending** appointment only. `400` for confirmed or
already-cancelled ones.

### `PATCH /api/appointments/:id/confirm` — admin
Confirms a **pending** appointment. `400` otherwise.

### `PATCH /api/appointments/:id/cancel-admin` — admin
Cancels a pending or confirmed appointment. Cancelling never changes the
payment status — a paid appointment stays `paid` in the records.

## Users — admin only

### `GET /api/users`
All registered users, newest first. Optional `?role=customer|admin`.
User object: `{ id, name, email, image, phone, role, isBlocked,
createdAt }`.

### `GET /api/users/:id`
`{ user, appointments: { total, pending, confirmed, cancelled } }`.

### `PATCH /api/users/:id/block`
JSON `{ isBlocked: true | false }`. Blocked users get `403` on every
protected route. Admins cannot block themselves or another admin.

## Payments

### `POST /api/payments/checkout/:appointmentId` — customer
Creates a Stripe Checkout session for a **confirmed, unpaid**
appointment owned by the caller. Returns
`{ checkoutUrl, sessionId }` — redirect the browser to `checkoutUrl`.
On success Stripe redirects to
`<CLIENT_URL>/payment/success?session_id={CHECKOUT_SESSION_ID}`;
on cancel, to `<CLIENT_URL>/payment/cancel`.

Amounts are in **USD** (Stripe test mode does not support BDT), charged
at the appointment's snapshotted price. `400` for pending, cancelled or
already-paid appointments; `503` when Stripe is not configured.

### `POST /api/payments/webhook` — Stripe only
Verifies the Stripe signature and updates the payment status. Only a
verified `checkout.session.completed` event with a paid payment marks
the appointment `paid` and creates the transaction. No client call
should ever hit this endpoint.

### `GET /api/payments/transactions` — admin
All payment records, newest first. Optional `?status=paid|failed`.

```json
{ "id": "...", "appointmentId": { "id": "...", "appointmentDate": "...",
  "timeSlot": "...", "servicePrice": 25, "status": "confirmed",
  "serviceId": { "serviceName": "..." } },
  "customerId": { "id": "...", "name": "...", "email": "..." },
  "amount": 25, "currency": "usd",
  "stripeSessionId": "cs_test_...", "status": "paid",
  "createdAt": "2026-11-20T..." }
```

## Profile

### `GET /api/profile/me` — signed-in user
`{ user }`.

### `PATCH /api/profile/me` — signed-in user
Update own name, phone and image only. Accepts JSON
`{ name?, phone?, image? }` (image as a URL) or a multipart form with
an `image` file (uploaded to ImgBB). Sending `role`, `isBlocked`,
`email` or `password` is rejected with `400`.

## Dashboards

### `GET /api/dashboard/customer` — customer
```json
{ "stats": { "totalAppointments": 5, "pendingAppointments": 1,
  "confirmedAppointments": 2, "cancelledAppointments": 2,
  "paidAppointments": 2, "totalSpent": 85 },
  "recentAppointments": [ "..." ] }
```

### `GET /api/dashboard/admin` — admin
```json
{ "stats": { "totalCustomers": 12, "totalActiveServices": 8,
  "totalAppointments": 30, "pendingAppointments": 4,
  "confirmedAppointments": 10, "totalSuccessfulPayments": 9,
  "totalRevenue": 410 },
  "recentAppointments": [ "..." ] }
```

## Rules the client must follow

- Never show the admin dashboard to customers (and vice versa) — and
  never rely on hiding links alone: the server enforces every role.
- Only `pending` appointments show a Cancel button for customers; only
  `confirmed` + `unpaid` appointments show Pay Now.
- Admins cannot book appointments (the server returns `403`).
- Passwords: minimum 6 characters, one uppercase, one lowercase letter.
- Prices are USD. Stripe test card: `4242 4242 4242 4242`, any future
  expiry, any CVC.
