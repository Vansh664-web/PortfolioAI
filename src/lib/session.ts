import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db, runWithDatabaseUser, setDatabaseUser } from "@/lib/db";
import { createHash, randomBytes } from "node:crypto";

const guestUserId = "portfolioai-guest";
const guestEmail = "guest@portfolioai.local";

const key = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
};
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
  await runWithDatabaseUser(userId, () => db.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } }));
  const jwt = await new SignJWT({ sid: hashToken(token) }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("14d").sign(key());
  (await cookies()).set("portfolioai_session", jwt, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
}
export async function currentUser() {
  const token = (await cookies()).get("portfolioai_session")?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, key());
      const userId = payload.sub;
      const sessionTokenHash = payload.sid;
      if (userId && typeof sessionTokenHash === "string") {
        const session = await runWithDatabaseUser(userId, () => db.session.findUnique({ where: { tokenHash: sessionTokenHash } }));
        if (session && session.userId === userId && session.expiresAt >= new Date()) {
          const user = await runWithDatabaseUser(userId, () => db.user.findUnique({ where: { id: userId }, include: { profile: true } }));
          if (user) {
            setDatabaseUser(userId);
            return user;
          }
        }
      }
    } catch {
      // Expired or invalid sessions fall back to the shared guest workspace.
    }
  }

  const existing = await db.user.findUnique({ where: { email: guestEmail }, select: { id: true } });
  const userId = existing?.id ?? guestUserId;
  const guest = await runWithDatabaseUser(userId, async () => {
    const user = await db.user.upsert({
      where: { email: guestEmail },
      create: {
        id: guestUserId,
        email: guestEmail,
        passwordHash: randomBytes(32).toString("hex"),
        emailVerifiedAt: new Date(),
        profile: { create: { fullName: "Guest Workspace", displayName: "Guest" } },
      },
      update: {},
    });
    const profile = await db.studentProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, fullName: "Guest Workspace", displayName: "Guest" },
      update: {},
    });
    return { ...user, profile };
  });
  setDatabaseUser(guest.id);
  return guest;
}
