import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { runWithDatabaseUser } from "@/lib/db";

export async function GET(){
 const user=await currentUser();return runWithDatabaseUser(user.id, async () => {

 try{
  const p=await db.studentProfile.findUnique({where:{userId:user.id},include:{skills:true,projects:true,education:true,experience:true,certifications:true,achievements:true,portfolios:{include:{theme:true,sections:true}}}});
  if(!p)return NextResponse.json({error:"Complete your profile to calculate a score."},{status:404});
  const portfolio=p.portfolios[0];const projects=p.projects;const sections=portfolio?.sections||[];const section=(kind:string)=>sections.find(s=>s.kind===kind)?.content as Record<string,unknown>|null;
  const aboutText=String(section("about")?.body||p.about||"");const hero=section("hero");const projectSection=section("projects");const cards=Array.isArray(projectSection?.projectCards)?projectSection.projectCards as {description?:string;url?:string}[]:[];
  const savedSocial=(p.socialLinks&&typeof p.socialLinks==="object"?p.socialLinks:{}) as Record<string,unknown>;const contactLinks=Array.isArray(section("contact")?.links)?section("contact")!.links as {url?:string}[]:[];const social={...savedSocial,...Object.fromEntries(contactLinks.map((l,i)=>[`portfolioLink${i}`,l.url]).filter(([,v])=>Boolean(v)))};
  const projectDescriptions=Math.max(projects.filter(x=>(x.description||x.problem||"").trim().length>=80).length,cards.filter(x=>(x.description||"").trim().length>=80).length);
  const projectLinks=Math.max(projects.filter(x=>x.githubUrl||x.demoUrl).length,cards.filter(x=>Boolean(x.url)).length);
  const categories=[
   {name:"Profile completeness",weight:14,score:[p.fullName,p.displayName,p.photoUrl].filter(Boolean).length/3*100,action:"Add a profile photo and preferred display name."},
   {name:"Professional headline",weight:5,score:String(hero?.heading||p.headline||"").trim().length>=12?100:0,action:"Add a concise headline describing your actual field of study or professional focus."},
   {name:"About me",weight:10,score:aboutText?Math.min(100,aboutText.trim().length/2.2):0,action:"Write an About section of at least 100 words that reflects your actual interests."},
   {name:"Education",weight:10,score:Math.min(100,[p.college||p.education.length,p.degree,p.branch,p.graduationYear].filter(Boolean).length/4*100),action:"Add your institution, degree, branch, and expected graduation year."},
   {name:"Skills",weight:10,score:Math.min(100,p.skills.length/8*100),action:"Add relevant skills you can demonstrate and group them by area."},
   {name:"Project descriptions",weight:13,score:projects.length||cards.length?Math.min(100,projectDescriptions/Math.max(projects.length,cards.length)*100):0,action:"Add a detailed description (80+ characters) to each project, including the problem and your contribution."},
   {name:"Project links",weight:10,score:projects.length||cards.length?Math.min(100,projectLinks/Math.max(projects.length,cards.length)*100):0,action:"Add a GitHub repository or live demo link to your projects."},
   {name:"Experience",weight:8,score:Math.min(100,p.experience.length/2*100),action:"Add internships, freelance work, hackathons, or leadership experience you have actually completed."},
   {name:"Achievements",weight:7,score:Math.min(100,(p.achievements.length+p.certifications.length)/3*100),action:"Add verifiable certificates, awards, competitions, or academic achievements."},
   {name:"Contact information",weight:7,score:Math.min(100,Object.values(social).filter(Boolean).length/2*100),action:"Add at least two contact or professional links, such as LinkedIn and GitHub."},
   {name:"Visual consistency",weight:3,score:portfolio?.theme?100:0,action:"Choose one theme so your portfolio uses a consistent visual system."},
   {name:"Mobile readiness",weight:3,score:portfolio?.theme?(portfolio.publishedAt?70:35):0,action:"Preview your portfolio at tablet and mobile sizes, then publish the responsive layout when it looks right."},
  ].map(c=>({...c,score:Math.round(c.score)}));
  const overall=Math.round(categories.reduce((sum,c)=>sum+c.score*c.weight/100,0));
  const strengths=categories.filter(c=>c.score>=70).map(c=>`${c.name} (${c.score}/100)`);
  const suggestions=categories.filter(c=>c.score<70).sort((a,b)=>a.score-b.score).map(c=>({category:c.name,score:c.score,weight:c.weight,action:c.action}));
  return NextResponse.json({overall,categories,strengths,suggestions,missing:{education:!p.college||!p.degree,skills:p.skills.length===0,projects:projects.length===0,experience:p.experience.length===0,achievements:p.achievements.length===0,contact:Object.keys(social).length===0},formula:"Overall = sum(category score × category weight). Weights add to 100. Completeness is based on saved profile records. About quality uses length as a simple readability proxy. Project detail and link scores use actual saved descriptions and URLs. A saved theme earns visual consistency credit; mobile readiness is only partial until the portfolio is published. No AI-generated suggestions or unverified claims add score."});
 }catch(e){console.error("Portfolio score failed",e);return NextResponse.json({error:"Could not calculate your current score."},{status:503})}

});
}
