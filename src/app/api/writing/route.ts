import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/session";
import { xaiChatCompletion, xaiErrorResponse } from "@/lib/xai";
import { rateLimitResponse } from "@/lib/rate-limit";
import { runWithDatabaseUser } from "@/lib/db";

const requestSchema = z.object({
  operation: z.enum(["generate", "improve", "rewrite", "grammar", "professional", "concise", "expand", "spelling", "vocabulary", "tone", "headline"]),
  text: z.string().max(6000),
  context: z.string().max(500).optional(),
  style: z.enum(["Professional", "Corporate", "Modern", "Creative", "Minimal", "Friendly", "Technical", "Academic"]).default("Professional"),
  tone: z.string().max(80).optional(),
});

const directions: Record<string, string> = {
  generate: "Write new content from the supplied context. If context lacks facts, ask a short clarifying question instead of inventing details.",
  improve: "Improve clarity and flow while preserving the student's meaning and every factual claim.",
  rewrite: "Rewrite the text in fresh wording while preserving its exact meaning and facts.",
  grammar: "Correct grammar and punctuation only. Preserve meaning and voice.",
  professional: "Make the text professional and clear, without adding claims or credentials.",
  concise: "Make the text more concise while preserving all meaningful facts.",
  expand: "Expand only by explaining facts already stated. Do not add examples, credentials, results, or claims.",
  spelling: "Correct spelling only. Preserve wording and meaning as much as possible.",
  vocabulary: "Improve word choice while preserving meaning, facts, and a natural student voice.",
  tone: "Change the tone to the requested tone while preserving all facts and meaning.",
  headline: "Create three concise professional headline options using only explicit supplied facts. If there are not enough facts, ask for them.",
};

export async function POST(req: Request) {
  const user = await currentUser();
  return runWithDatabaseUser(user.id, async () => {

  const limited = await rateLimitResponse(req, `ai:${user.id}`, 24, 60_000);
  if (limited) return limited;
  let input: z.infer<typeof requestSchema>;
  try { input = requestSchema.parse(await req.json()); }
  catch { return NextResponse.json({ error: "Check the text and writing options, then try again." }, { status: 400 }); }
  if (!input.text.trim() && input.operation !== "generate" && input.operation !== "headline") return NextResponse.json({ error: "Add some text to improve first." }, { status: 400 });
  try {
    const result = await xaiChatCompletion({ userId: user.id, temperature: 0.25, maxTokens: 1200, messages: [
        { role: "system", content: "You are a careful writing editor for student portfolios. Never infer or add skills, degrees, employers, experience, achievements, certifications, outcomes, numbers, or qualifications. Preserve the author's meaning. Return only the edited text, without quotes or explanation. When supplied information is insufficient, ask one brief question instead." },
        { role: "user", content: `Task: ${directions[input.operation]}\nWriting style: ${input.style}${input.tone ? `; tone: ${input.tone}` : ""}\nField context: ${input.context ?? "portfolio content"}\nStudent text:\n${input.text}` },
      ] });
    return NextResponse.json({ result });
  } catch (error) { const failure = xaiErrorResponse(error); return NextResponse.json({ error: `${failure.error} Original text remains unchanged.` }, { status: failure.status }); }

});
}
