export function xaiConfiguration() {
  const apiKey = process.env.XAI_API_KEY?.trim();
  const model = process.env.XAI_MODEL?.trim();
  const baseUrl = process.env.XAI_BASE_URL?.trim().replace(/\/+$/, "");
  if (!apiKey || !model || !baseUrl) return null;
  try {
    const parsed = new URL(baseUrl);
    const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    if ((parsed.protocol !== "https:" && !localHttp) || parsed.username || parsed.password) return null;
  } catch { return null; }
  return { apiKey, model, endpoint: baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions` };
}

export function xaiTimeout(fallback = 30_000) {
  const timeout = Number(process.env.XAI_TIMEOUT_MS || fallback);
  return Math.min(120_000, Math.max(5_000, Number.isFinite(timeout) ? timeout : fallback));
}
