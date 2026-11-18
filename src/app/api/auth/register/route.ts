import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db, runWithDatabaseUser } from "@/lib/db";
import { createOpaqueToken } from "@/lib/auth-tokens";
import { emailDeliveryConfigured, emailBaseUrl, sendEmail } from "@/lib/email";
import { rateLimitResponse, requestAddressScope } from "@/lib/rate-limit";

const inputSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254), password: z.string().min(12).max(128) });
const verificationLifetimeMs = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const limited = await rateLimitResponse(request, `register:${requestAddressScope(request)}`, 5, 60 * 60 * 1000);
  if (limited) return limited;
  try {
    const input = inputSchema.parse(await request.json());
    const autoVerify = process.env.NODE_ENV === "development" || !emailDeliveryConfigured();
    const email = input.email.toLowerCase();
    const passwordHash = await bcrypt.hash(input.password, 12);
    const userId = randomUUID().replaceAll("-", "");
    const { token, tokenHash } = autoVerify ? { token: null, tokenHash: null } : createOpaqueToken();
    const user = await runWithDatabaseUser(userId, () => db.user.create({ data: {
      id: userId,
      email,
      passwordHash,
      emailVerifiedAt: autoVerify ? new Date() : null,
      verificationToken: tokenHash,
      verificationExpiresAt: tokenHash ? new Date(Date.now() + verificationLifetimeMs) : null,
      profile: { create: { fullName: input.name, displayName: input.name } },
    } }));
    if (autoVerify) {
      console.info(`Auto-verified local signup for ${user.email}; email delivery is not required.`);
      return NextResponse.json({ ok: true, next: "/dashboard", message: "Your account is ready." }, { status: 201 });
    }

    const baseUrl = emailBaseUrl(request);
    const verificationUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token!)}`;
    try {
      const delivery = await sendEmail({ to: user.email, subject: "Verify your PortfolioAI email", text: `Verify your email: ${verificationUrl}`, html: `<p>Verify your PortfolioAI email address.</p><p><a href="${verificationUrl}">Verify email</a></p><p>This link expires in 24 hours and can only be used once.</p>` });
      return NextResponse.json({ ok: true, next: "/verify-email", message: "Check your email for a verification link.", ...(delivery.mode === "development" ? { developmentLink: verificationUrl, deliveryMode: delivery.mode } : {}) }, { status: 201 });
    } catch {
      console.error("Registration verification email could not be delivered");
      return NextResponse.json({ ok: true, next: "/verify-email", message: "Your account was created, but verification email delivery failed. Request a new link.", ...(process.env.NODE_ENV !== "production" ? { developmentLink: verificationUrl, deliveryMode: "development" } : {}) }, { status: 201 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Check your name, email, and password (12+ characters)." }, { status: 400 });
    if ((error as { code?: string }).code === "P2002") return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    console.error("Registration failed");
    return NextResponse.json({ error: "Registration is temporarily unavailable." }, { status: 503 });
  }
}
