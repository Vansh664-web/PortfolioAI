import { createHash } from "node:crypto";

const DEFAULT_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
const DEFAULT_GEMINI_FALLBACKS = ["gemini-3.1-flash-lite"];

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function chatEndpoint(baseUrl, label) {
  let parsed;
  try { parsed = new URL(baseUrl); }
  catch { fail(`${label} is not a valid URL.`, 2); }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname))) {
    fail(`${label} must use HTTPS outside local development.`, 2);
  }
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  const path = parsed.pathname.replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(path)) return normalized;
  if (path.endsWith("/v1") || /\/openai$/i.test(path)) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

function configuration() {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
    const fallbacks = (process.env.GEMINI_MODEL_FALLBACKS ?? DEFAULT_GEMINI_FALLBACKS.join(",")).split(",").map(m => m.trim()).filter(Boolean);
    return {
      name: "Gemini",
      apiKey: geminiKey,
      endpoint: chatEndpoint(process.env.GEMINI_BASE_URL?.trim() || DEFAULT_GEMINI_BASE, "GEMINI_BASE_URL"),
      models: [...new Set([model, ...fallbacks])],
      extraBody: {},
    };
  }

  const missing = ["XAI_API_KEY", "XAI_MODEL", "XAI_BASE_URL"].filter(name => !process.env[name]?.trim());
  if (missing.length) fail(`No AI provider configured. Set GEMINI_API_KEY, or provide ${missing.join(", ")}.`, 2);
  return {
    name: "xAI",
    apiKey: process.env.XAI_API_KEY.trim(),
    endpoint: chatEndpoint(process.env.XAI_BASE_URL, "XAI_BASE_URL"),
    models: [process.env.XAI_MODEL.trim()],
    extraBody: { safety_identifier: createHash("sha256").update("portfolioai-manual-integration-test").digest("hex") },
  };
}

const config = configuration();
const timeoutMs = Math.min(120_000, Math.max(5_000, Number(process.env.AI_TIMEOUT_MS || process.env.XAI_TIMEOUT_MS || 30_000)));

for (const model of config.models) {
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 900,
        messages: [{ role: "user", content: "Reply with exactly: PortfolioAI AI connection verified." }],
        ...config.extraBody,
      }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });

    if (response.status === 401 || response.status === 403) fail(`${config.name} integration failed: credentials or model access rejected.`);
    if (response.status === 429) fail(`${config.name} integration failed: provider rate limit reached.`);
    if (response.status === 404 || response.status === 503) {
      const reason = response.status === 404 ? "model not available" : "model overloaded";
      process.stderr.write(`${config.name} model ${model}: ${reason}; trying the next configured model.\n`);
      continue;
    }
    if (!response.ok) fail(`${config.name} integration failed: provider returned HTTP ${response.status}.`);

    const payload = await response.json();
    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) fail(`${config.name} returned an empty or unexpected response.`);
    process.stdout.write(`${config.name} integration succeeded using configured model ${model}.\n`);
    process.exit(0);
  } catch (error) {
    if (error?.name === "TimeoutError") fail(`${config.name} integration timed out.`);
    fail(`${config.name} integration could not reach the provider.`);
  }
}

fail(`No configured ${config.name} model responded successfully.`);
