import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { users } from "@/db/schema";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    if (!rateLimit(`login:${ip}`, 8)) return NextResponse.json({ error: "Too many sign-in attempts. Try again shortly." }, { status: 429 });
    const data = loginSchema.parse(await request.json());
    const [user] = await db.select().from(users).where(eq(users.email, data.email.toLowerCase())).limit(1);
    if (!user || !(await compare(data.password, user.passwordHash))) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }
    if (user.isBlocked) return NextResponse.json({ error: "This account is currently unavailable. Please contact support." }, { status: 403 });
    await createSession({ id: user.id, name: user.name, email: user.email, role: user.role });
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    return errorResponse(error);
  }
}
