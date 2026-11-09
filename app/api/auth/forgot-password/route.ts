import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { users } from "@/db/schema";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { getEmailConfig } from "@/lib/env";
import { issueOtp, OtpError, rateLimitOtp, setOtpFlow } from "@/lib/otp";
import { z } from "zod";

const genericMessage = "If this email is registered, an OTP has been sent.";

export async function POST(request: Request) {
  try {
    const body = z.object({ email: z.email().transform((value) => value.trim().toLowerCase()) }).parse(await request.json());
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    getEmailConfig();
    await setOtpFlow(body.email, "password_reset");
    try {
      await rateLimitOtp(body.email, ip, "send");
      const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(and(
        eq(users.email, body.email), eq(users.emailVerified, true), eq(users.isBlocked, false), isNull(users.deletedAt),
      )).limit(1);
      if (user) await issueOtp(user.email, "password_reset", ip);
    } catch (error) {
      if (!(error instanceof OtpError)) {
        console.error("Password-reset code request failed.", { name: error instanceof Error ? error.name : "UnknownError" });
      }
    }
    await setOtpFlow(body.email, "password_reset");
    return NextResponse.json({ message: genericMessage }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
