import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { xaiChatCompletion, xaiErrorResponse } from "@/lib/xai";
import { rateLimitResponse } from "@/lib/rate-limit";
import { runWithDatabaseUser } from "@/lib/db";

const sections = ["Personal information", "Career goals", "Skills", "Projects", "Education", "Experience", "Achievements", "Personal branding"];
const answerSchema = z.object({ conversationId: z.string().optional(), action: z.enum(["answer", "generate", "publish", "save"]), step: z.number().int().min(0).max(7).optional(), question: z.string().max(500).optional(), answer: z.string().max(5000).optional(), content: z.record(z.string(), z.unknown()).optional(), theme: z.string().max(40).optional(), confirm: z.boolean().optional() });
const generatedSchema = z.object({ headline: z.string().max(240), about: z.string().max(4000), objective: z.string().max(2000), projects: z.array(z.record(z.string(), z.unknown())).max(50), education: z.array(z.record(z.string(), z.unknown())).max(20), skills: z.array(z.string().max(100)).max(100), experience: z.array(z.record(z.string(), z.unknown())).max(50), achievements: z.array(z.record(z.string(), z.unknown())).max(50), recommendedSections: z.array(z.string().max(80)).max(20), themeRecommendations: z.array(z.string().max(80)).length(3), seoTitle: z.string().max(70), seoDescription: z.string().max(180), followUpQuestions: z.array(z.string().max(500)).max(10) });

export async function GET() {
  const user = await currentUser(); return runWithDatabaseUser(user.id, async () => {

  try {
    const conversation = await db.aIConversation.findFirst({ where: { userId: user.id, kind: "interview", status: "in_progress" }, orderBy: { updatedAt: "desc" }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    return NextResponse.json({ conversation, sections });
  } catch (error) { console.error("Interview load failed", error); return NextResponse.json({ error: "Interview could not be loaded." }, { status: 503 }); }

});
}

export async function POST(req: Request) {
  const user = await currentUser(); return runWithDatabaseUser(user.id, async () => {

  try {
    const data = answerSchema.parse(await req.json());
    let conversation = data.conversationId ? await db.aIConversation.findFirst({ where: { id: data.conversationId, userId: user.id, kind: "interview" } }) : null;
    if (!conversation) conversation = await db.aIConversation.create({ data: { userId: user.id, kind: "interview", answers: {}, currentStep: 0, messages: { create: { role: "assistant", content: "Hello! Welcome to PortfolioAI. I'm your personal portfolio assistant. I'll ask you a few simple questions and help you create your professional portfolio." } } } });
    if (data.action === "answer") {
      if (!data.question || !data.answer?.trim()) return NextResponse.json({ error: "Please enter an answer, or use Skip for this question." }, { status: 400 });
      const answers = { ...(conversation.answers as Record<string, unknown>), [`${sections[data.step ?? 0]}: ${data.question}`]: data.answer.trim() } as Prisma.InputJsonObject;
      const step = Math.max(conversation.currentStep, data.step ?? 0);
      const assistantReply = step >= 7 ? "Thank you. Your interview is complete. Review your answers and ask me to prepare a portfolio draft when you're ready." : `Thanks for sharing that. Let's talk about ${sections[step + 1].toLowerCase()}.`;
      const updated = await db.aIConversation.update({ where: { id: conversation.id }, data: { answers, currentStep: step, messages: { create: [{ role: "assistant", content: data.question }, { role: "user", content: data.answer.trim() }, { role: "assistant", content: assistantReply }] } } });
      return NextResponse.json({ conversation: updated });
    }
    if (data.action === "save") return NextResponse.json({ conversation: await db.aIConversation.update({ where: { id: conversation.id }, data: { generatedContent: data.content ? data.content as Prisma.InputJsonObject : undefined } }) });
    if (data.action === "publish") {
      if (data.confirm !== true) return NextResponse.json({ error: "Confirm before publishing this portfolio." }, { status: 400 });
      if (!data.content || !data.theme) return NextResponse.json({ error: "Review your portfolio and choose a theme before publishing." }, { status: 400 });
      const answers = conversation.answers as Record<string, string>;
      const fullName = Object.entries(answers).find(([k]) => k.includes("full name"))?.[1] ?? user.profile?.fullName ?? "student";
      const slug = `${fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${user.id.slice(-6)}`;
      const portfolio = await db.portfolio.upsert({ where: { slug }, create: { userId: user.id, profileId: user.profile!.id, slug, headline: String(data.content.headline ?? ""), about: String(data.content.about ?? ""), objective: String(data.content.objective ?? ""), seoTitle: String(data.content.seoTitle ?? ""), seoDescription: String(data.content.seoDescription ?? ""), publishedAt: new Date(), theme: { create: { name: data.theme } } }, update: { headline: String(data.content.headline ?? ""), about: String(data.content.about ?? ""), objective: String(data.content.objective ?? ""), publishedAt: new Date(), theme: { upsert: { create: { name: data.theme }, update: { name: data.theme } } } } });
      await db.aIConversation.update({ where: { id: conversation.id }, data: { status: "completed" } });
      return NextResponse.json({ portfolio });
    }
    const limited = await rateLimitResponse(req, `ai:${user.id}`, 24, 60_000);
    if (limited) return limited;
    if (conversation.generatedContent && typeof conversation.generatedContent === "object" && !Array.isArray(conversation.generatedContent)) {
      return NextResponse.json({ conversation, generated: conversation.generatedContent, reusedSavedDraft: true });
    }
    const prompt = `Create a portfolio draft using only the student's answers. Never invent facts. For missing or unclear information, return followUpQuestions instead of assuming. Return JSON with keys headline, about, objective, projects (only actual projects), education, skills, experience, achievements, recommendedSections, themeRecommendations (exactly 3), seoTitle, seoDescription, followUpQuestions. Clearly label any ideas as suggestions, never as actual accomplishments. Answers: ${JSON.stringify(conversation.answers)}`;
    const raw = await xaiChatCompletion({ userId: user.id, temperature: 0.2, jsonMode: true, maxTokens: 5000, messages: [{ role: "system", content: "You help students present only verified information they supplied. Do not invent qualifications or accomplishments. Ask follow-up questions for missing or unclear facts. Return valid JSON matching the requested keys." }, { role: "user", content: prompt }] });
    let generated: z.infer<typeof generatedSchema>;
    try { generated = generatedSchema.parse(JSON.parse(raw)); }
    catch { return NextResponse.json({ error: "The AI returned an incomplete draft. Your interview remains saved; try generating again." }, { status: 502 }); }
    const updated = await db.aIConversation.update({ where: { id: conversation.id }, data: { generatedContent: generated as Prisma.InputJsonObject } });
    return NextResponse.json({ conversation: updated, generated });
  } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid interview data." }, { status: 400 }); const failure=xaiErrorResponse(error); return NextResponse.json({ error: `${failure.error} Your previous answers are safe.` }, { status: failure.status }); }

});
}
