import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";

const input = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254), password: z.string().min(12).max(128) });
export async function POST(req: Request) {
  try {
    const data = input.parse(await req.json());
    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await db.user.create({ data: { email: data.email.toLowerCase(), passwordHash, profile: { create: { fullName: data.name, displayName: data.name } } } });
    await createSession(user.id);
    return NextResponse.json({ ok: true, next: "/onboarding" }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Check your name, email, and password (12+ characters)." }, { status: 400 });
    if ((e as { code?: string }).code === "P2002") return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    console.error("Registration failed", e); return NextResponse.json({ error: "Registration is temporarily unavailable." }, { status: 503 });
  }
}
