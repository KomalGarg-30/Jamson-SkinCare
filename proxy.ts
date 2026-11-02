import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const isApiRequest = request.nextUrl.pathname.startsWith("/api/");
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  if (isApiRequest && isMutation && request.nextUrl.pathname !== "/api/payments/webhook") {
    const origin = request.headers.get("origin");
    let originMatches = false;
    try {
      originMatches = Boolean(origin && new URL(origin).origin === request.nextUrl.origin);
    } catch {
      originMatches = false;
    }
    if (!originMatches) {
      return NextResponse.json({ error: "This request could not be verified. Refresh the page and try again." }, { status: 403 });
    }
  }
  if (request.nextUrl.pathname.startsWith("/admin") && !request.cookies.has("jamson_session")) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/api/:path*"] };
