import { createHash } from "node:crypto";

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };
export type AiRequest = { messages: AiMessage[]; userId: string; temperature?: number; jsonMode?: boolean; maxTokens?: number };
export type AiErrorCode = "CONFIGURATION" | "INVALID_CREDENTIALS" | "RATE_LIMITED" | "TIMEOUT" | "NETWORK" | "PROVIDER" | "INVALID_RESPONSE";

/** Backwards-compatible aliases: existing routes and components import the Xai* names. */
export type XaiMessage = AiMessage;
export type XaiRequest = AiRequest;
export type XaiErrorCode = AiErrorCode;

export class AiServiceError extends Error {
  constructor(readonly code: AiErrorCode, message: string, readonly status: number) {
    super(message);
    this.name = "AiServiceError";
  }
}
export { AiServiceError as XaiServiceError };

const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
const DEFAULT_GEMINI_FALLBACKS = ["gemini-3.1-flash-lite"];
/** Gemini thinking models spend output tokens on reasoning, so leave headroom for the actual answer. */
const GEMINI_OUTPUT_HEADROOM = 768;
const MAX_OUTPUT_TOKENS = 8192;

type Provider = "gemini" | "xai";
type ProviderConfig = { provider: Provider; apiKey: string; endpoint: string; models: string[] };

function chatEndpoint(baseUrl: string, label: string) {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new AiServiceError("CONFIGURATION", `${label} must be a valid HTTPS API base URL.`, 503);
  }
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  const localDevelopmentHttp = process.env.NODE_ENV !== "production" && parsed.protocol === "http:" && loopback;
  if ((parsed.protocol !== "https:" && !localDevelopmentHttp) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new AiServiceError("CONFIGURATION", `${label} must be a valid HTTPS API base URL.`, 503);
  }
  const normalized = baseUrl.replace(/\/+$/, "");
  const path = parsed.pathname.replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(path)) return normalized;
  if (path.endsWith("/v1") || /\/openai$/i.test(path)) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

/**
 * Resolves the active AI provider from the server environment.
 * Gemini takes precedence when GEMINI_API_KEY is set; otherwise the xAI configuration is used.
 */
function configuration(): ProviderConfig {
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiApiKey) {
    const baseUrl = process.env.GEMINI_BASE_URL?.trim() || DEFAULT_GEMINI_BASE_URL;
    const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
    const declaredFallbacks = (process.env.GEMINI_MODEL_FALLBACKS ?? DEFAULT_GEMINI_FALLBACKS.join(","))
      .split(",")
      .map(model => model.trim())
      .filter(Boolean);
    return {
      provider: "gemini",
      apiKey: geminiApiKey,
      endpoint: chatEndpoint(baseUrl, "GEMINI_BASE_URL"),
      models: [...new Set([primary, ...declaredFallbacks])],
    };
  }

  const apiKey = process.env.XAI_API_KEY?.trim();
  const model = process.env.XAI_MODEL?.trim();
  const baseUrl = process.env.XAI_BASE_URL?.trim();
  if (!apiKey || !model || !baseUrl) {
    throw new AiServiceError("CONFIGURATION", "Configure GEMINI_API_KEY, or XAI_API_KEY, XAI_MODEL, and XAI_BASE_URL, on the server.", 503);
  }
  return { provider: "xai", apiKey, endpoint: chatEndpoint(baseUrl, "XAI_BASE_URL"), models: [model] };
}

/** True when a provider is fully configured. Safe to call without throwing. */
export function aiConfigured() {
  try {
    configuration();
    return true;
  } catch {
    return false;
  }
}

/** The primary model name for display purposes, or null when AI is not configured. */
export function aiModelName() {
  try {
    return configuration().models[0] ?? null;
  } catch {
    return null;
  }
}

export function xaiTimeout(fallback = 30_000) {
  const configured = Number(process.env.XAI_TIMEOUT_MS || process.env.AI_TIMEOUT_MS || fallback);
  return Math.min(120_000, Math.max(5_000, Number.isFinite(configured) ? configured : fallback));
}
export const aiTimeout = xaiTimeout;

function outputBudget(provider: Provider, requested: number) {
  if (provider !== "gemini") return requested;
  return Math.min(MAX_OUTPUT_TOKENS, requested + GEMINI_OUTPUT_HEADROOM);
}

async function postCompletion(config: ProviderConfig, model: string, request: AiRequest) {
  const body: Record<string, unknown> = {
    model,
    messages: request.messages,
    temperature: Math.min(1, Math.max(0, request.temperature ?? 0.3)),
    ...(request.jsonMode ? { response_format: { type: "json_object" } } : {}),
    ...(request.maxTokens ? { max_tokens: outputBudget(config.provider, request.maxTokens) } : {}),
    ...(config.provider === "xai" ? { safety_identifier: createHash("sha256").update(request.userId).digest("hex") } : {}),
  };

  try {
    return await fetch(config.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(xaiTimeout(config.provider === "gemini" ? 60_000 : 30_000)),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw new AiServiceError("TIMEOUT", "The AI request timed out. Try again.", 504);
    throw new AiServiceError("NETWORK", "The AI service could not be reached. Try again.", 502);
  }
}

/** Server-only Chat Completions client. Provider, model, endpoint, credentials and timeout are configuration-driven. */
export async function aiChatCompletion(request: AiRequest): Promise<string> {
  const config = configuration();
  let lastError: AiServiceError | null = null;

  for (const model of config.models) {
    const response = await postCompletion(config, model, request);

    if (response.status === 401 || response.status === 403) {
      throw new AiServiceError("INVALID_CREDENTIALS", "The AI credentials or model permissions are invalid. Check server configuration.", 503);
    }
    if (response.status === 429) {
      throw new AiServiceError("RATE_LIMITED", "The AI provider is rate limiting requests. Wait briefly and retry.", 429);
    }
    // A retired or overloaded model can be recovered by trying the next configured model.
    if ((response.status === 404 || response.status === 503) && model !== config.models[config.models.length - 1]) {
      lastError = new AiServiceError("PROVIDER", response.status === 404
        ? `The configured AI model ${model} is not available. Update the model in server configuration.`
        : "The AI provider is temporarily overloaded. Try again shortly.", 502);
      continue;
    }
    if (response.status === 404) {
      throw new AiServiceError("PROVIDER", `The configured AI model ${model} is not available. Update the model in server configuration.`, 502);
    }
    if (response.status === 503) {
      throw new AiServiceError("PROVIDER", "The AI provider is temporarily overloaded. Try again shortly.", 502);
    }
    if (!response.ok) {
      throw new AiServiceError("PROVIDER", "The AI provider returned an error. Try again later.", 502);
    }

    let payload: { choices?: { finish_reason?: string; message?: { content?: unknown } }[] };
    try {
      payload = await response.json() as typeof payload;
    } catch {
      throw new AiServiceError("INVALID_RESPONSE", "The AI provider returned an invalid response.", 502);
    }
    const choice = payload.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      if (choice?.finish_reason === "length") {
        throw new AiServiceError("INVALID_RESPONSE", "The AI response was cut off before any text was produced. Try a shorter request.", 502);
      }
      throw new AiServiceError("INVALID_RESPONSE", "The AI provider returned an empty response.", 502);
    }
    if (content.length > 32_000) {
      throw new AiServiceError("INVALID_RESPONSE", "The AI provider returned an oversized response.", 502);
    }
    return content.trim();
  }

  throw lastError ?? new AiServiceError("PROVIDER", "The AI provider returned an error. Try again later.", 502);
}

/** Backwards-compatible name used by the existing API routes. */
export const xaiChatCompletion = aiChatCompletion;

export function aiErrorResponse(error: unknown) {
  if (error instanceof AiServiceError) return { error: error.message, status: error.status };
  return { error: "The AI request failed. Try again.", status: 502 };
}
export const xaiErrorResponse = aiErrorResponse;
