import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, runWithDatabaseUser } from "@/lib/db";
import { hashOpaqueToken } from "@/lib/auth-tokens";
import { rateLimitResponse, requestAddressScope } from "@/lib/rate-limit";

const schema = z.object({ token: z.string().min(32).max(128), password: z.string().min(12).max(128) });

export async function POST(request: Request) {
  const limited = await rateLimitResponse(request, `password-reset-complete:${requestAddressScope(request)}`, 10, 60 * 60 * 1000);
  if (limited) return limited;
  try {
    const { token, password } = schema.parse(await request.json());
    const tokenHash = hashOpaqueToken(token);
    const now = new Date();
    const user = await db.user.findFirst({ where: { resetToken: tokenHash, resetExpiresAt: { gt: now } }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "This reset link is invalid, expired, or already used." }, { status: 400 });
    const passwordHash = await bcrypt.hash(password, 12);
    const changed = await runWithDatabaseUser(user.id, () => db.$transaction(async transaction => {
      const result = await transaction.user.updateMany({ where: { id: user.id, resetToken: tokenHash, resetExpiresAt: { gt: now } }, data: { passwordHash, resetToken: null, resetExpiresAt: null } });
      if (!result.count) return false;
      await transaction.session.deleteMany({ where: { userId: user.id } });
      return true;
    }));
    if (!changed) return NextResponse.json({ error: "This reset link is invalid, expired, or already used." }, { status: 400 });
    return NextResponse.json({ ok: true, message: "Password updated. Sign in with your new password." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Choose a password with at least 12 characters." }, { status: 400 });
    console.error("Password reset failed");
    return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503 });
  }
}
