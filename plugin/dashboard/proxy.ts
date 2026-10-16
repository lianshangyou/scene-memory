import { NextRequest, NextResponse } from "next/server";

function loopback(value: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(
    value.toLowerCase(),
  );
}

export function proxy(request: NextRequest) {
  try {
    const host = new URL(`http://${request.headers.get("host") || ""}`);
    if (!loopback(host.hostname)) throw new Error("Non-local host");
    const origin = request.headers.get("origin");
    if (origin && !loopback(new URL(origin).hostname))
      throw new Error("Non-local origin");
    if (
      request.headers.get("sec-fetch-site") === "cross-site" &&
      request.nextUrl.pathname.startsWith("/api/")
    )
      throw new Error("Cross-site API request");
  } catch {
    return NextResponse.json({ error: "Local access only" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
