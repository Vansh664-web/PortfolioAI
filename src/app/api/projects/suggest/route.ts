import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { aiConfigured, xaiChatCompletion, xaiErrorResponse } from "@/lib/xai";
import { rateLimitResponse } from "@/lib/rate-limit";
import { runWithDatabaseUser } from "@/lib/db";

const inputSchema = z.object({ category: z.string().trim().min(1).max(80), idea: z.string().trim().min(1).max(500) });
const suggestionsSchema = z.object({ technologies: z.array(z.string().max(60)).max(20), layouts: z.array(z.string().max(160)).length(3), note: z.string().max(500) });

export async function POST(request: Request) {
  const user = await currentUser();
  return runWithDatabaseUser(user.id, async () => {

  const limited = await rateLimitResponse(request, `ai:${user.id}`, 24, 60_000);
  if (limited) return limited;
  try {
    const input = inputSchema.parse(await request.json());
    const profile = await db.studentProfile.findUnique({ where: { userId: user.id }, include: { skills: true } });
    if (!profile) return NextResponse.json({ error: "Complete your profile first." }, { status: 404 });
    if (aiConfigured()) {
      try {
        const content = await xaiChatCompletion({ userId: user.id, temperature: 0.2, jsonMode: true, maxTokens: 1000, messages: [
          { role: "system", content: "Suggest optional technology choices and portfolio presentation only. Do not assert the user used or built anything. Return JSON with technologies (array), layouts (array of 3), note." },
          { role: "user", content: JSON.stringify({ category: input.category, idea: input.idea, knownSkills: profile.skills.map(skill => skill.name) }) },
        ] });
        return NextResponse.json(suggestionsSchema.parse(JSON.parse(content)));
      } catch (error) {
        const failure = xaiErrorResponse(error);
        return NextResponse.json({ error: failure.error }, { status: failure.status });
      }
    }
    const category = input.category.toLowerCase();
    const technologies = category.includes("web") || category.includes("software") ? ["HTML/CSS", "JavaScript", "React", "PostgreSQL"] : category.includes("data") ? ["Python", "pandas", "Jupyter", "Matplotlib"] : category.includes("design") ? ["Figma", "FigJam", "HTML/CSS"] : [...profile.skills.slice(0, 4).map(skill => skill.name), "Git and GitHub"];
    return NextResponse.json({ technologies, layouts: ["Problem → process → result", "Overview with visual gallery", "Case study with project timeline"], note: "Optional project ideas only. Add tools you choose and actually use.", source: "local-guidance" });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Add a project category and short idea first." }, { status: 400 });
    console.error("Project suggestions failed");
    return NextResponse.json({ error: "Suggestions are unavailable right now." }, { status: 503 });
  }

});
}
