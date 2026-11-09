import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { users } from "@/db/schema";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { signupSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { issueOtp, OtpError, rateLimitOtp } from "@/lib/otp";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const data = signupSchema.parse(await request.json());
    if (!await rateLimit(`signup:${ip}`, 5)) {
      return NextResponse.json({ error: "Too many sign-up attempts. Try again shortly." }, { status: 429 });
    }
    await rateLimitOtp(data.email, ip, "send");
    const [existing] = await db.select({
      id: users.id, emailVerified: users.emailVerified, isBlocked: users.isBlocked, deletedAt: users.deletedAt,
    }).from(users).where(eq(users.email, data.email)).limit(1);
    if (existing?.emailVerified || existing?.isBlocked || existing?.deletedAt) {
      return NextResponse.json({ error: "An account with this email already exists or is unavailable." }, { status: 409 });
    }
    if (!existing) {
      await db.insert(users).values({
        name: data.name, email: data.email, phone: data.phone, passwordHash: await hash(data.password, 12),
        emailVerified: false, emailVerifiedAt: null,
      });
    } else {
      await db.update(users).set({
        name: data.name, phone: data.phone, passwordHash: await hash(data.password, 12), updatedAt: new Date(),
      }).where(eq(users.id, existing.id));
    }
    await issueOtp(data.email, "signup", ip);
    return NextResponse.json({ message: "Check your inbox for a verification code.", email: data.email }, { status: 201 });
  } catch (error) {
    if (error instanceof OtpError) {
      return NextResponse.json({
        error: error.message,
        ...(error.retryAfterSeconds ? { remainingSeconds: error.retryAfterSeconds } : {}),
      }, { status: error.status });
    }
    return errorResponse(error);
  }
}
