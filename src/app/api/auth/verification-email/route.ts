import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createOpaqueToken } from "@/lib/auth-tokens";
import { emailBaseUrl, emailDeliveryConfigured, sendEmail } from "@/lib/email";
import { rateLimitResponse, requestAddressScope } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().trim().email().max(254) });
const lifetimeMs = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  let email = "";
  try { email = schema.parse(await request.json()).email.toLowerCase(); }
  catch { return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 }); }
  const emailHash = createHash("sha256").update(email).digest("hex");
  const limited = await rateLimitResponse(request, `verify-email:${requestAddressScope(request)}:${emailHash}`, 3, 60 * 60 * 1000);
  if (limited) return limited;
  if (process.env.NODE_ENV === "production" && !emailDeliveryConfigured()) return NextResponse.json({ error: "Email delivery is not configured. Contact the administrator." }, { status: 503 });
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) return NextResponse.json({ ok: true, message: "If the account needs verification, a link will be sent." });
    const baseUrl = emailBaseUrl(request);
    const { token, tokenHash } = createOpaqueToken();
    await db.user.update({ where: { id: user.id }, data: { verificationToken: tokenHash, verificationExpiresAt: new Date(Date.now() + lifetimeMs) } });
    const url = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const delivery = await sendEmail({ to: user.email, subject: "Verify your PortfolioAI email", text: `Verify your email: ${url}`, html: `<p>Verify your PortfolioAI email address.</p><p><a href="${url}">Verify email</a></p><p>This link expires in 24 hours and can only be used once.</p>` });
    return NextResponse.json({ ok: true, message: "If the account needs verification, a link will be sent.", ...(delivery.mode === "development" ? { developmentLink: url, deliveryMode: "development" } : {}) });
  } catch {
    console.error("Verification email could not be sent");
    return NextResponse.json({ error: "Verification email delivery is unavailable. Try again later." }, { status: 503 });
  }
}
