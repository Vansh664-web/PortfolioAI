export type EmailMessage = { to: string; subject: string; text: string; html: string };
export type EmailResult = { delivered: boolean; mode: "resend" | "development" };

export class EmailConfigurationError extends Error {}

export function emailDeliveryConfigured() {
  return Boolean(process.env.EMAIL_PROVIDER?.trim() && process.env.EMAIL_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  const apiKey = process.env.EMAIL_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!provider || !apiKey || !from) {
    if (process.env.NODE_ENV !== "production") return { delivered: false, mode: "development" };
    throw new EmailConfigurationError("Configure EMAIL_PROVIDER, EMAIL_API_KEY, and EMAIL_FROM before sending email.");
  }
  if (provider !== "resend") throw new EmailConfigurationError("EMAIL_PROVIDER must be set to the supported provider 'resend'.");
  if (/[\r\n]/.test(from) || !from.includes("@")) throw new EmailConfigurationError("EMAIL_FROM must be a valid sender address.");

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new Error("The email service could not be reached.");
  }
  if (response.status === 401 || response.status === 403) throw new EmailConfigurationError("The email provider rejected its API credentials.");
  if (response.status === 429) throw new Error("The email provider is rate limiting requests.");
  if (!response.ok) throw new Error("The email provider did not accept this message.");
  return { delivered: true, mode: "resend" };
}

export function emailBaseUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_PORTFOLIO_BASE_URL?.trim().replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production" && !configured) {
    throw new EmailConfigurationError("Set NEXT_PUBLIC_PORTFOLIO_BASE_URL to your HTTPS application URL.");
  }
  const base = configured || new URL(request.url).origin;
  let parsed: URL;
  try { parsed = new URL(base); }
  catch { throw new EmailConfigurationError("NEXT_PUBLIC_PORTFOLIO_BASE_URL must be a valid URL."); }
  if ((process.env.NODE_ENV === "production" && parsed.protocol !== "https:") || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new EmailConfigurationError("Set NEXT_PUBLIC_PORTFOLIO_BASE_URL to your HTTPS application URL.");
  }
  return parsed.origin;
}
