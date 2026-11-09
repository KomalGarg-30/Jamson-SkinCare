import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { hash } from "bcryptjs";
import { cookies } from "next/headers";
import { users } from "@/db/schema";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { getEnv } from "@/lib/env";

function failure(request: Request) {
  return NextResponse.redirect(new URL("/login?error=google", request.url));
}

export async function GET(request: Request) {
  try {
    const env = getEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return failure(request);
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    const storedState = (await cookies()).get("decotrin_google_state")?.value;
    if (!code || !returnedState || !storedState) return failure(request);
    const [state, encodedNext] = storedState.split(".", 2);
    if (!state || state !== returnedState) return failure(request);
    const next = Buffer.from(encodedNext || "", "base64url").toString() || "/";
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${url.origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) return failure(request);
    const token = await tokenResponse.json() as { access_token?: string };
    if (!token.access_token) return failure(request);
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (!profileResponse.ok) return failure(request);
    const profile = await profileResponse.json() as { email?: string; email_verified?: boolean; name?: string };
    const email = profile.email?.trim().toLowerCase();
    if (!email || profile.email_verified !== true || !profile.name?.trim()) return failure(request);
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing?.isBlocked || existing?.deletedAt) return failure(request);
    const passwordHash = existing?.passwordHash || await hash(randomBytes(32).toString("hex"), 12);
    const [user] = existing
      ? await db.update(users).set({
        name: existing.name || profile.name.trim(), emailVerified: true, emailVerifiedAt: existing.emailVerifiedAt || new Date(),
        lastLoginAt: new Date(), updatedAt: new Date(),
      }).where(and(eq(users.id, existing.id), eq(users.isBlocked, false), isNull(users.deletedAt)))
        .returning({ id: users.id, name: users.name, email: users.email, role: users.role, sessionVersion: users.sessionVersion })
      : await db.insert(users).values({
        name: profile.name.trim(), email, passwordHash, emailVerified: true, emailVerifiedAt: new Date(), lastLoginAt: new Date(),
      }).returning({ id: users.id, name: users.name, email: users.email, role: users.role, sessionVersion: users.sessionVersion });
    if (!user) return failure(request);
    await createSession(user);
    const response = NextResponse.redirect(new URL(next, url.origin));
    response.cookies.delete("decotrin_google_state");
    return response;
  } catch (error) {
    console.error("Google sign-in failed.", { name: error instanceof Error ? error.name : "UnknownError" });
    return failure(request);
  }
}
