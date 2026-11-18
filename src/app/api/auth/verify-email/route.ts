import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashOpaqueToken } from "@/lib/auth-tokens";
import { rateLimitResponse, requestAddressScope } from "@/lib/rate-limit";

const schema = z.object({ token: z.string().min(32).max(128) });

export async function POST(request: Request) {
  const limited = await rateLimitResponse(request, `verify:${requestAddressScope(request)}`, 10, 15 * 60 * 1000);
  if (limited) return limited;
  try {
    const { token } = schema.parse(await request.json());
    const tokenHash = hashOpaqueToken(token);
    const now = new Date();
    const result = await db.user.updateMany({
      where: { verificationToken: tokenHash, verificationExpiresAt: { gt: now }, emailVerifiedAt: null },
      data: { emailVerifiedAt: now, verificationToken: null, verificationExpiresAt: null },
    });
    if (!result.count) return NextResponse.json({ error: "This verification link is invalid, expired, or already used." }, { status: 400 });
    return NextResponse.json({ ok: true, message: "Email verified. You can now sign in." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid verification link." }, { status: 400 });
    console.error("Email verification failed");
    return NextResponse.json({ error: "Email verification is temporarily unavailable." }, { status: 503 });
  }
}
