# SalonBook — Server

SalonBook is a salon appointment booking platform. Customers browse salon
services, request appointments and pay for confirmed appointments through
Stripe. Admins manage services, confirm or cancel appointments, manage
customers and view payment transactions.

This repository holds the **server** (Express.js + MongoDB + Better Auth +
Stripe). The client is a separate Next.js app.

> Programming Hero Assignment 9 — Category 002.

## Important Features

- Better Auth authentication: email/password sign-up and sign-in, Google
  sign-in, and JWT access tokens for API calls.
- Role-based access: `customer` and `admin`, verified on the server for
  every protected route. Admin accounts cannot be created through public
  registration.
- Services: public browsing with search by name, category filter and
  sorting by price; admin CRUD with image upload to ImgBB and
  active/inactive status.
- Appointments: customers book a date + time slot; duplicate bookings for
  the same service, date and slot are rejected; customers cancel only
  their own pending appointments; admins confirm pending appointments and
  cancel pending or confirmed ones.
- Payments: Stripe Checkout for confirmed appointments. The payment
  status changes to `paid` **only** after a verified Stripe webhook event;
  no endpoint can mark a payment successful manually.
- Users: admins view all customers and block/unblock them. Blocked users
  are rejected from every protected route.
- Dashboards: overview statistics for customers and admins.
- Profile: users update their own name, phone and profile image (upload
  or URL). Role and blocked status cannot be changed through the profile.

## Technology Stack

- Node.js 20+ with Express.js 4
- MongoDB with Mongoose, plus the native MongoDB driver for Better Auth
- Better Auth (email/password + Google OAuth)
- JSON Web Tokens (`jsonwebtoken`) for API access tokens
- Stripe Checkout + webhooks (test mode)
- ImgBB for image hosting
- Multer for image uploads

## Installation Instructions

```bash
git clone https://github.com/shuvo524/SalonBook-server-side.git
cd SalonBook-server-side
npm install
```

## How to Run the Project Locally

1. Copy the example environment file and fill in your own values:

   ```bash
   cp .env.example .env
   ```

2. Start the server:

   ```bash
   npm start
   ```

   For development with auto-restart: `npm run dev`.

3. Seed sample services (optional, only needed once):

   ```bash
   npm run seed
   ```

4. Create an admin account:
   - Sign up through the client app with the admin's email address.
   - Then promote that account from the terminal:

     ```bash
     npm run promote-admin -- admin@example.com
     ```

   (There is intentionally no way to register an admin from the website.)

The server runs on `http://localhost:5000` by default. Check
`GET /api/health` — it answers
`{ "success": true, "data": { "status": "ok" } }`.

Run the integration test suite (boots the real app against an
in-memory MongoDB — no real database or keys needed):

```bash
npm test
```

## Required Environment Variables

See `.env.example` for the full list with explanations. Never put real
values in Git — `.env` is ignored.

| Variable | Purpose |
| --- | --- |
| `PORT` | Port the server listens on |
| `NODE_ENV` | `development` or `production` |
| `BETTER_AUTH_URL` | Public URL of this server |
| `CLIENT_URL` | Client origin(s), comma-separated |
| `MONGODB_URI` | MongoDB Atlas connection string (with database name) |
| `BETTER_AUTH_SECRET` | Better Auth secret (long random string) |
| `JWT_SECRET` | JWT signing secret (a different long random string) |
| `JWT_EXPIRES_IN` | JWT lifetime, e.g. `7d` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (optional for local dev) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (optional for local dev) |
| `STRIPE_SECRET_KEY` | Stripe test-mode secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `IMGBB_API_KEY` | ImgBB API key |
| `COOKIE_CROSS_SITE` | `true` in production (client and server on different domains) |

## API Reference

See [API_CONTRACT.md](./API_CONTRACT.md) — every endpoint, its auth and
role requirements, request bodies and response shapes.

## Deployment Notes

- Deploy the server (e.g. on Render) and set all environment variables in
  the hosting dashboard — never commit `.env`.
- Set `BETTER_AUTH_URL` to the deployed server URL and `CLIENT_URL` to the
  deployed client URL, and `COOKIE_CROSS_SITE=true`.
- In the Stripe dashboard (test mode), create a webhook endpoint pointing
  to `https://<server>/api/payments/webhook` listening to
  `checkout.session.completed` and `checkout.session.expired`, and copy
  its signing secret into `STRIPE_WEBHOOK_SECRET`.
- Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC.

## Live Website Link

<!-- Add the deployed client URL here after deployment. -->

## Repository Links

- Client repository: https://github.com/shuvo524/SalonBook-client-side
- Server repository: https://github.com/shuvo524/SalonBook-server-side
