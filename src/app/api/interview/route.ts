import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { xaiConfiguration, xaiTimeout } from "@/lib/xai";

const sections = ["Personal information", "Career goals", "Skills", "Projects", "Education", "Experience", "Achievements", "Personal branding"];
const answerSchema = z.object({ conversationId: z.string().optional(), action: z.enum(["answer", "generate", "publish", "save"]), step: z.number().int().min(0).max(7).optional(), question: z.string().max(500).optional(), answer: z.string().max(5000).optional(), content: z.record(z.string(), z.unknown()).optional(), theme: z.string().max(40).optional() });

export async function GET() {
  const user = await currentUser(); if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const conversation = await db.aIConversation.findFirst({ where: { userId: user.id, kind: "interview", status: "in_progress" }, orderBy: { updatedAt: "desc" }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    return NextResponse.json({ conversation, sections });
  } catch (error) { console.error("Interview load failed", error); return NextResponse.json({ error: "Interview could not be loaded." }, { status: 503 }); }
}

export async function POST(req: Request) {
  const user = await currentUser(); if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
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
      if (!data.content || !data.theme) return NextResponse.json({ error: "Review your portfolio and choose a theme before publishing." }, { status: 400 });
      const answers = conversation.answers as Record<string, string>;
      const fullName = Object.entries(answers).find(([k]) => k.includes("full name"))?.[1] ?? user.profile?.fullName ?? "student";
      const slug = `${fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${user.id.slice(-6)}`;
      const portfolio = await db.portfolio.upsert({ where: { slug }, create: { userId: user.id, profileId: user.profile!.id, slug, headline: String(data.content.headline ?? ""), about: String(data.content.about ?? ""), objective: String(data.content.objective ?? ""), seoTitle: String(data.content.seoTitle ?? ""), seoDescription: String(data.content.seoDescription ?? ""), publishedAt: new Date(), theme: { create: { name: data.theme } } }, update: { headline: String(data.content.headline ?? ""), about: String(data.content.about ?? ""), objective: String(data.content.objective ?? ""), publishedAt: new Date(), theme: { upsert: { create: { name: data.theme }, update: { name: data.theme } } } } });
      await db.aIConversation.update({ where: { id: conversation.id }, data: { status: "completed" } });
      return NextResponse.json({ portfolio });
    }
    const xai = xaiConfiguration();
    if (!xai) return NextResponse.json({ error: "Portfolio generation needs XAI_API_KEY, XAI_MODEL, and XAI_BASE_URL in the server environment. Your interview is saved." }, { status: 503 });
    const prompt = `Create a portfolio draft using only the student's answers. Never invent facts. For missing or unclear information, return followUpQuestions instead of assuming. Return JSON with keys headline, about, objective, projects (only actual projects), education, skills, experience, achievements, recommendedSections, themeRecommendations (exactly 3), seoTitle, seoDescription, followUpQuestions. Clearly label any ideas as suggestions, never as actual accomplishments. Answers: ${JSON.stringify(conversation.answers)}`;
    const response = await fetch(xai.endpoint, { method: "POST", headers: { Authorization: `Bearer ${xai.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: xai.model, temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "system", content: "You help students present only verified information they supplied. Do not invent qualifications or accomplishments. Return valid JSON." }, { role: "user", content: prompt }] }), signal: AbortSignal.timeout(xaiTimeout(30_000)) });
    if (!response.ok) { console.error("xAI response status", response.status); return NextResponse.json({ error: "AI service is unavailable. Your interview remains saved." }, { status: 502 }); }
    const result = await response.json(); const generated = JSON.parse(result.choices?.[0]?.message?.content ?? "{}");
    const updated = await db.aIConversation.update({ where: { id: conversation.id }, data: { generatedContent: generated as Prisma.InputJsonObject } });
    return NextResponse.json({ conversation: updated, generated });
  } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid interview data." }, { status: 400 }); console.error("Interview request failed", error); return NextResponse.json({ error: "We couldn't complete that step. Your previous answers are safe." }, { status: 503 }); }
}
