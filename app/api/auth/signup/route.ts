import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { users } from "@/db/schema";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { signupSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    if (!rateLimit(`signup:${ip}`, 5)) return NextResponse.json({ error: "Too many sign-up attempts. Try again shortly." }, { status: 429 });
    const data = signupSchema.parse(await request.json());
    const email = data.email.toLowerCase();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    const passwordHash = await hash(data.password, 12);
    const [user] = await db.insert(users).values({ name: data.name, email, passwordHash }).returning({
      id: users.id, email: users.email, name: users.name, role: users.role,
    });
    await createSession(user);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
