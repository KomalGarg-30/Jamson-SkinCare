import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { getEnv } from "@/lib/env";

const COOKIE_NAME = "jamson_session";
const secret = () => new TextEncoder().encode(getEnv().JWT_SECRET);

export type SessionUser = { id: string; email: string; name: string; role: "user" | "admin"; sessionVersion?: number };

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user, sessionVersion: user.sessionVersion ?? 0 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt()
    .setExpirationTime("7d").sign(secret());
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.id !== "string" || typeof payload.email !== "string" ||
        typeof payload.name !== "string" || (payload.role !== "user" && payload.role !== "admin") ||
        typeof payload.sessionVersion !== "number") return null;
    return { id: payload.id, email: payload.email, name: payload.name, role: payload.role, sessionVersion: payload.sessionVersion };
  } catch {
    return null;
  }
}

export async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  const [user] = await db.select({ id: users.id, isBlocked: users.isBlocked, role: users.role, sessionVersion: users.sessionVersion, deletedAt: users.deletedAt })
    .from(users).where(eq(users.id, session.id)).limit(1);
  if (!user || user.isBlocked || user.deletedAt || user.sessionVersion !== session.sessionVersion) throw new Error("UNAUTHORIZED");
  return { ...session, role: user.role };
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("FORBIDDEN");
  return user;
}

export async function requireAdminPage() {
  const user = await getSession();
  if (!user) redirect("/login?next=/admin");
  const [record] = await db.select({ role: users.role, isBlocked: users.isBlocked, sessionVersion: users.sessionVersion, deletedAt: users.deletedAt })
    .from(users).where(eq(users.id, user.id)).limit(1);
  if (!record || record.isBlocked || record.deletedAt || record.sessionVersion !== user.sessionVersion || record.role !== "admin") redirect("/");
  return user;
}
