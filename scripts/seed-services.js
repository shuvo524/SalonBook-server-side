// Seed the services collection with sample salon services so the home
// page's "Featured Services" section has data on first run.
//
// Usage:
//   node scripts/seed-services.js          (does nothing if services exist)
//   node scripts/seed-services.js --force  (replaces all services)
//
// Prices are in USD — Stripe test mode does not support BDT, and the
// checkout flow charges the amounts stored here. Seed images are Unsplash
// placeholders; admins upload real photos through the service form.
import { connectDB, disconnectDB } from "../src/config/db.js";
import { Service } from "../src/models/Service.js";

const image = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`;

const SERVICES = [
  {
    serviceName: "Signature Haircut",
    category: "Haircut & Styling",
    description:
      "Consultation, precision cut, relaxing wash and a blow-dry finish styled your way.",
    price: 25,
    duration: 45,
    image: image("photo-1560066984-138dadb4c035"),
  },
  {
    serviceName: "Full Hair Coloring",
    category: "Hair Coloring",
    description:
      "Full-head colour with premium dye, deep conditioning and a gloss finish.",
    price: 60,
    duration: 120,
    image: image("photo-1562322140-8baeececf3df"),
  },
  {
    serviceName: "Keratin Smooth Treatment",
    category: "Hair Treatment",
    description:
      "Keratin therapy that tames frizz and leaves hair silky and smooth for weeks.",
    price: 85,
    duration: 150,
    image: image("photo-1521590832167-7bcbfaa6381f"),
  },
  {
    serviceName: "Hydra Glow Facial",
    category: "Facial & Skincare",
    description:
      "Deep cleansing, gentle exfoliation, hydration mask and a soothing face massage.",
    price: 55,
    duration: 60,
    image: image("photo-1570172619644-dfd03ed1350b"),
  },
  {
    serviceName: "Bridal Makeup",
    category: "Makeup",
    description:
      "Complete bridal look: long-wear base, eye makeup, lashes and touch-up kit.",
    price: 80,
    duration: 90,
    image: image("photo-1487412947147-5cebf100ffc2"),
  },
  {
    serviceName: "Manicure & Pedicure",
    category: "Manicure & Pedicure",
    description:
      "Soak, shaping, cuticle care, scrub, massage and your choice of polish.",
    price: 35,
    duration: 75,
    image: image("photo-1604654894610-df63bc536371"),
  },
  {
    serviceName: "Full Body Spa & Massage",
    category: "Spa & Massage",
    description:
      "Aromatherapy full-body massage with warm oils to melt away stress.",
    price: 70,
    duration: 90,
    image: image("photo-1544161515-4ab6ce6db874"),
  },
  {
    serviceName: "Beard Trim & Styling",
    category: "Haircut & Styling",
    description:
      "Precision beard shaping, hot-towel treatment and styling with beard oil.",
    price: 15,
    duration: 30,
    image: image("photo-1503951914875-452162b0f3f1"),
  },
];

try {
  await connectDB();
  const existing = await Service.countDocuments();
  if (existing > 0 && !process.argv.includes("--force")) {
    console.log(
      `${existing} services already exist. Use --force to replace them.`
    );
  } else {
    if (existing > 0) await Service.deleteMany({});
    await Service.insertMany(SERVICES);
    console.log(`Seeded ${SERVICES.length} services.`);
  }
} catch (error) {
  console.error("Seed failed:", error.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
