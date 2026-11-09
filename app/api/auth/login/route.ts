import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { auditLogs, users } from "@/db/schema";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { issueOtp, OtpError, rateLimitOtp } from "@/lib/otp";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    if (!await rateLimit(`login:${ip}`, 8)) return NextResponse.json({ error: "Too many sign-in attempts. Try again shortly." }, { status: 429 });
    const data = loginSchema.parse(await request.json());
    const email = data.email.trim().toLowerCase();
    const [record] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!record || !(await compare(data.password, record.passwordHash))) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }
    if (record.isBlocked || record.deletedAt) return NextResponse.json({ error: "This account is currently unavailable. Please contact support." }, { status: 403 });
    if (!record.emailVerified) {
      await rateLimitOtp(email, ip, "send");
      try {
        await issueOtp(email, "signup", ip);
      } catch (error) {
        if (error instanceof OtpError) {
          return NextResponse.json({
            verificationRequired: true, email, error: error.message,
            ...(error.retryAfterSeconds ? { remainingSeconds: error.retryAfterSeconds } : {}),
          }, { status: error.status });
        }
        throw error;
      }
      return NextResponse.json({ verificationRequired: true, email });
    }
    const [user] = await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, record.id)).returning({
        id: users.id, name: users.name, email: users.email, role: users.role, sessionVersion: users.sessionVersion,
      });
    await db.insert(auditLogs).values({ actorUserId: user.id, targetUserId: user.id, action: "login" });
    await createSession(user);
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
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
