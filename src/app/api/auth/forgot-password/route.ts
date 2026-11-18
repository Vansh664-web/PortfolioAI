import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createOpaqueToken } from "@/lib/auth-tokens";
import { emailBaseUrl, emailDeliveryConfigured, sendEmail } from "@/lib/email";
import { rateLimitResponse, requestAddressScope } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().trim().email().max(254) });
const genericMessage = "If an account exists for that address, and email delivery is available, a reset link will be sent.";
const lifetimeMs = 30 * 60 * 1000;

export async function POST(request: Request) {
  let email = "";
  try { email = schema.parse(await request.json()).email.toLowerCase(); }
  catch { return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 }); }
  const emailHash = createHash("sha256").update(email).digest("hex");
  const limited = await rateLimitResponse(request, `password-reset:${requestAddressScope(request)}:${emailHash}`, 3, 60 * 60 * 1000);
  if (limited) return limited;
  if (process.env.NODE_ENV === "production" && !emailDeliveryConfigured()) return NextResponse.json({ error: "Password reset email is not configured. Contact the administrator." }, { status: 503 });
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ ok: true, message: genericMessage });
    const baseUrl = emailBaseUrl(request);
    const { token, tokenHash } = createOpaqueToken();
    await db.user.update({ where: { id: user.id }, data: { resetToken: tokenHash, resetExpiresAt: new Date(Date.now() + lifetimeMs) } });
    const url = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    try {
      const delivery = await sendEmail({ to: user.email, subject: "Reset your PortfolioAI password", text: `Reset your password: ${url}`, html: `<p>We received a password reset request.</p><p><a href="${url}">Reset password</a></p><p>This link expires in 30 minutes and can only be used once. Ignore this message if you did not request the reset.</p>` });
      return NextResponse.json({ ok: true, message: genericMessage, ...(delivery.mode === "development" ? { developmentLink: url, deliveryMode: "development" } : {}) });
    } catch {
      console.error("Password reset email could not be delivered");
      return NextResponse.json({ ok: true, message: genericMessage });
    }
  } catch {
    console.error("Password reset request failed");
    return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503 });
  }
}
