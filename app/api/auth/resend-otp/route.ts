import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { users } from "@/db/schema";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { getEmailConfig, getEnv } from "@/lib/env";
import { issueOtp, OtpError, rateLimitOtp, requireOtpFlow, setOtpFlow, type OtpPurpose } from "@/lib/otp";
import { z } from "zod";

export async function POST(request: Request) {
  try {
    const data = z.object({
      email: z.email().transform((value) => value.trim().toLowerCase()),
      purpose: z.enum(["signup", "password_reset"]),
    }).parse(await request.json());
    const flow = await requireOtpFlow(data.email, data.purpose as OtpPurpose);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    await rateLimitOtp(data.email, ip, "send");
    if (data.purpose === "password_reset") getEmailConfig();
    if (data.purpose === "password_reset") {
      const remaining = getEnv().OTP_RESEND_COOLDOWN_SECONDS - Math.floor(Date.now() / 1000 - flow.sentAt);
      if (remaining > 0) {
        return NextResponse.json({
          error: `Please wait ${remaining} seconds before requesting another code.`,
          remainingSeconds: remaining,
        }, { status: 429 });
      }
    }
    const [user] = await db.select({ email: users.email }).from(users).where(and(
      eq(users.email, data.email),
      eq(users.isBlocked, false),
      isNull(users.deletedAt),
      data.purpose === "signup" ? eq(users.emailVerified, false) : eq(users.emailVerified, true),
    )).limit(1);
    if (!user) {
      if (data.purpose === "password_reset") {
        await setOtpFlow(data.email, data.purpose, Math.floor(Date.now() / 1000), flow.resendCount + 1);
      }
      return NextResponse.json({ message: "If this email is registered, an OTP has been sent." }, { headers: { "Cache-Control": "no-store" } });
    }
    if (data.purpose === "password_reset") {
      let sent = false;
      try {
        await issueOtp(user.email, data.purpose, ip);
        sent = true;
      } catch (error) {
        if (!(error instanceof OtpError)) {
          console.error("Password-reset code resend failed.", { name: error instanceof Error ? error.name : "UnknownError" });
        }
      }
      if (sent) {
        await setOtpFlow(data.email, data.purpose, Math.floor(Date.now() / 1000), flow.resendCount + 1);
      }
      return NextResponse.json({ message: "If this email is registered, an OTP has been sent." }, { headers: { "Cache-Control": "no-store" } });
    }
    const sent = await issueOtp(user.email, data.purpose, ip);
    return NextResponse.json({ message: "A new code has been sent.", lastSentAt: sent.lastSentAt.toISOString() });
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
