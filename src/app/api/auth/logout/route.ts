import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { db, runWithDatabaseUser } from "@/lib/db";
export async function POST() { const jar=await cookies(); const token=jar.get("portfolioai_session")?.value; if(token) { try { const {payload}=await jwtVerify(token,new TextEncoder().encode(process.env.AUTH_SECRET)); const tokenHash=payload.sid; const userId=payload.sub; if(typeof tokenHash==="string"&&typeof userId==="string") await runWithDatabaseUser(userId,()=>db.session.deleteMany({where:{tokenHash,userId}})); } catch {} } jar.delete("portfolioai_session"); return NextResponse.json({ok:true}); }
