import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { emailOtps, passwordResetTokens, users } from "@/db/schema";
import { db } from "@/lib/db";
import { clearOtpFlow, OtpError, requireOtpFlow, verifyOtp } from "@/lib/otp";
import { errorResponse } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  code: z.string().regex(/^\d{4,8}$/),
});

export async function POST(request: Request) {
  try {
    const data = schema.parse(await request.json());
    await requireOtpFlow(data.email, "password_reset");
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const otp = await verifyOtp(data.email, "password_reset", data.code, ip);
    const [user] = await db.select({ id: users.id }).from(users).where(and(
      eq(users.email, data.email), eq(users.emailVerified, true), eq(users.isBlocked, false), isNull(users.deletedAt),
    )).limit(1);
    if (!user) throw new OtpError("This code is invalid or has expired. Request a new code and try again.", 400);
    const resetToken = randomBytes(32).toString("hex");
    await db.transaction(async (tx) => {
      const now = new Date();
      const [used] = await tx.update(emailOtps).set({ usedAt: now })
        .where(and(eq(emailOtps.id, otp.id), isNull(emailOtps.usedAt))).returning({ id: emailOtps.id });
      if (!used) throw new OtpError("This code has already been used. Request a new code to continue.", 400);
      await tx.update(passwordResetTokens).set({ usedAt: now, updatedAt: now })
        .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
      await tx.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: createHash("sha256").update(resetToken).digest("hex"),
        expiresAt: new Date(now.getTime() + 10 * 60_000),
      });
    });
    await clearOtpFlow();
    return NextResponse.json({ resetToken });
  } catch (error) {
    if (error instanceof OtpError) return NextResponse.json({ error: error.message }, { status: error.status });
    return errorResponse(error);
  }
}
