import { NextRequest, NextResponse } from "next/server";

async function verifySession(cookie: string, secret: string): Promise<boolean> {
  const idx = cookie.lastIndexOf(".");
  if (idx === -1) return false;
  const value = cookie.slice(0, idx);
  const signature = cookie.slice(idx + 1);

  // Use Web Crypto API (Edge-compatible)
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return expected === signature;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip auth routes
  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  const secret =
    process.env.TELEGRAM_BOT_TOKEN || "digiroot-fallback-secret";

  const session = req.cookies.get("dg_session")?.value;
  const valid = session ? await verifySession(session, secret) : false;

  if (!valid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/((?!auth).*)"],
};
