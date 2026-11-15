import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
const input = z.object({ email: z.string().email(), password: z.string().min(1).max(128) });
export async function POST(req: Request) {
  try { const data=input.parse(await req.json()); const user=await db.user.findUnique({where:{email:data.email.toLowerCase()},include:{profile:true}}); if(!user||!(await bcrypt.compare(data.password,user.passwordHash))) return NextResponse.json({error:"Email or password is incorrect."},{status:401}); await createSession(user.id); return NextResponse.json({ok:true,next:user.profile?.onboardingComplete?"/dashboard":"/onboarding"}); }
  catch(e) { if(e instanceof z.ZodError) return NextResponse.json({error:"Enter a valid email and password."},{status:400}); console.error("Login failed",e); return NextResponse.json({error:"Login is temporarily unavailable."},{status:503}); }
}
