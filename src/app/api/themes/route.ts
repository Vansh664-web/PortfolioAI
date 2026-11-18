import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Prisma } from "@prisma/client";
import { runWithDatabaseUser } from "@/lib/db";

const settingsSchema=z.object({active:z.string().max(60).default("minimal-clean"),custom:z.array(z.object({id:z.string().max(60),name:z.string().max(60),category:z.string().max(40),description:z.string().max(200).optional(),colors:z.record(z.string(),z.string()).optional(),font:StringSchema().optional(),layout:z.string().max(30),radius:z.number().min(0).max(40).optional()})).max(30).default([]),favorites:z.array(z.string().max(60)).max(100).default([]),customization:z.record(z.string(),z.unknown()).default({})});
function StringSchema(){return z.string().max(100)}
export async function GET(){const user=await currentUser();return runWithDatabaseUser(user.id, async () => {
try{const portfolio=await db.portfolio.findFirst({where:{userId:user.id},include:{theme:true,profile:{include:{projects:true,education:true,skills:true}}}});const profile=await db.studentProfile.findUnique({where:{userId:user.id},include:{projects:true,education:true,skills:true}});return NextResponse.json({theme:portfolio?.theme??null,portfolioId:portfolio?.id??null,profile:profile?{name:profile.displayName||profile.fullName,headline:portfolio?.headline||profile.headline,about:portfolio?.about||profile.about,college:profile.college,degree:profile.degree,branch:profile.branch,projects:profile.projects,education:profile.education,skills:profile.skills}:null})}catch(e){console.error("Theme load failed",e);return NextResponse.json({error:"Theme preferences are unavailable."},{status:503})}
});
}
export async function PUT(req:Request){const user=await currentUser();return runWithDatabaseUser(user.id, async () => {
try{const body=await req.json();const input=z.object({name:z.string().min(1).max(60),settings:settingsSchema}).parse(body);const profile=await db.studentProfile.findUnique({where:{userId:user.id}});if(!profile)return NextResponse.json({error:"Complete your profile before creating a portfolio theme."},{status:409});let portfolio=await db.portfolio.findFirst({where:{userId:user.id}});if(!portfolio){const slug=`${(profile.displayName||profile.fullName||"student").toLowerCase().replace(/[^a-z0-9]+/g,"-")}-${user.id.slice(-6)}`;portfolio=await db.portfolio.create({data:{userId:user.id,profileId:profile.id,slug}})}const settings=input.settings as unknown as Prisma.InputJsonObject;const theme=await db.portfolioTheme.upsert({where:{portfolioId:portfolio.id},create:{portfolioId:portfolio.id,name:input.name,settings},update:{name:input.name,settings}});return NextResponse.json({theme})}catch(e){if(e instanceof z.ZodError)return NextResponse.json({error:"Theme settings are invalid."},{status:400});console.error("Theme save failed",e);return NextResponse.json({error:"Could not save theme settings."},{status:503})}
});
}
