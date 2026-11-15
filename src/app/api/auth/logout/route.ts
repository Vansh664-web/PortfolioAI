import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/session";
export async function POST() { const jar=await cookies(); const token=jar.get("portfolioai_session")?.value; if(token) { try { const {payload}=await jwtVerify(token,new TextEncoder().encode(process.env.AUTH_SECRET)); if(typeof payload.sid==="string") await db.session.deleteMany({where:{tokenHash:payload.sid}}); } catch {} } jar.delete("portfolioai_session"); return NextResponse.json({ok:true}); }
