import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createHash, randomBytes } from "node:crypto";

const key = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
};
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
  await db.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  const jwt = await new SignJWT({ sid: hashToken(token) }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("14d").sign(key());
  (await cookies()).set("portfolioai_session", jwt, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
}
export async function currentUser() {
  const token = (await cookies()).get("portfolioai_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (!payload.sub || typeof payload.sid !== "string") return null;
    const session = await db.session.findUnique({ where: { tokenHash: payload.sid }, include: { user: { include: { profile: true } } } });
    if (!session || session.expiresAt < new Date()) return null;
    return session.user;
  } catch { return null; }
}
