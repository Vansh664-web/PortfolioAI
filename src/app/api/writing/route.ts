import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/session";
import { xaiConfiguration, xaiTimeout } from "@/lib/xai";

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
  if (!(await currentUser())) return NextResponse.json({ error: "Sign in to use the writing assistant." }, { status: 401 });
  let input: z.infer<typeof requestSchema>;
  try { input = requestSchema.parse(await req.json()); }
  catch { return NextResponse.json({ error: "Check the text and writing options, then try again." }, { status: 400 }); }
  if (!input.text.trim() && input.operation !== "generate" && input.operation !== "headline") return NextResponse.json({ error: "Add some text to improve first." }, { status: 400 });
  const xai = xaiConfiguration();
  if (!xai) return NextResponse.json({ error: "AI writing needs XAI_API_KEY, XAI_MODEL, and XAI_BASE_URL configured on the server. Your text has not been changed." }, { status: 503 });
  try {
    const response = await fetch(xai.endpoint, {
      method: "POST", headers: { Authorization: `Bearer ${xai.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: xai.model, temperature: 0.25, messages: [
        { role: "system", content: "You are a careful writing editor for student portfolios. Never infer or add skills, degrees, employers, experience, achievements, certifications, outcomes, numbers, or qualifications. Preserve the author's meaning. Return only the edited text, without quotes or explanation. When supplied information is insufficient, ask one brief question instead." },
        { role: "user", content: `Task: ${directions[input.operation]}\nWriting style: ${input.style}${input.tone ? `; tone: ${input.tone}` : ""}\nField context: ${input.context ?? "portfolio content"}\nStudent text:\n${input.text}` },
      ] }), signal: AbortSignal.timeout(xaiTimeout(25_000)),
    });
    if (!response.ok) { console.error("xAI writing status", response.status); return NextResponse.json({ error: "The AI service is temporarily unavailable. Your original text is unchanged." }, { status: 502 }); }
    const payload = await response.json(); const result = payload.choices?.[0]?.message?.content;
    if (typeof result !== "string" || !result.trim() || result.length > 8000) return NextResponse.json({ error: "The AI returned an unusable result. Try again." }, { status: 502 });
    return NextResponse.json({ result: result.trim() });
  } catch (error) { console.error("Writing request failed", error); return NextResponse.json({ error: "Could not reach the AI service. Your original text is unchanged." }, { status: 502 }); }
}
