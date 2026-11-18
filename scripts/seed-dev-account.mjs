import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const email = "dev@portfolioai.local";
const password = "DevPassword123!";
const userId = "dev-portfolioai-local";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be configured.");

// The seed uses the same database identity expected by the RLS policies for
// the profile created below. User itself is intentionally not RLS protected.
const url = new URL(process.env.DATABASE_URL);
const priorOptions = url.searchParams.get("options")?.trim() || "";
url.searchParams.set("options", `${priorOptions} -c app.user_id=${userId}`.trim());
url.searchParams.set("connection_limit", "1");

const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });

try {
  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.upsert({
    where: { email },
    create: {
      id: userId,
      email,
      passwordHash,
      emailVerifiedAt: new Date(),
      profile: { create: { fullName: "PortfolioAI Developer", displayName: "Developer" } },
    },
    update: {
      passwordHash,
      emailVerifiedAt: new Date(),
      verificationToken: null,
      verificationExpiresAt: null,
      profile: {
        upsert: {
          create: { fullName: "PortfolioAI Developer", displayName: "Developer" },
          update: { fullName: "PortfolioAI Developer", displayName: "Developer" },
        },
      },
    },
  });
  console.info(`Seeded ${email} with a verified development login.`);
} finally {
  await db.$disconnect();
}
