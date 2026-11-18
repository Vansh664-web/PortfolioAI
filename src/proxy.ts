import { NextRequest, NextResponse } from "next/server";

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/") || !mutationMethods.has(request.method)) return NextResponse.next();
  const origin = request.headers.get("origin");
  if (!origin) return NextResponse.json({ error: "A same-origin request origin is required." }, { status: 403 });
  try {
    const parsedOrigin = new URL(origin);
    const requestHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
    const requestProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || request.nextUrl.protocol.replace(":", "");
    if (parsedOrigin.host.toLowerCase() !== requestHost.toLowerCase() || parsedOrigin.protocol !== `${requestProtocol}:`) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  } catch { return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
