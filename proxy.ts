import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const isApiRequest = request.nextUrl.pathname.startsWith("/api/");
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  if (isApiRequest && isMutation && request.nextUrl.pathname !== "/api/payments/webhook" &&
      request.nextUrl.pathname !== "/api/webhooks/razorpay") {
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
  const isAdminPage = request.nextUrl.pathname.startsWith("/admin");
  const isAdminApi = request.nextUrl.pathname.startsWith("/api/admin/");
  if (isAdminPage || isAdminApi) {
    const token = request.cookies.get("jamson_session")?.value;
    if (!token) {
      if (isAdminApi) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
      const login = new URL("/login", request.url);
      login.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(login);
    }
    let isAdmin = false;
    try {
      const secret = process.env.JWT_SECRET;
      if (secret) {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
        isAdmin = payload.role === "admin" && typeof payload.id === "string";
      }
    } catch {
      isAdmin = false;
    }
    if (!isAdmin) {
      if (isAdminApi) return NextResponse.json({ error: "You do not have permission to do that." }, { status: 403 });
      return NextResponse.redirect(new URL("/", request.url));
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/api/:path*"] };
