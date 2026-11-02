import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { passwordResetTokens, users } from "@/db/schema";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/mailer";
import { getEnv } from "@/lib/env";
import { z } from "zod";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    if (!rateLimit(`forgot:${ip}`, 4)) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    const body = z.object({ email: z.email() }).parse(await request.json());
    const email = body.email.trim().toLowerCase();
    const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, email)).limit(1);
    if (user) {
      const token = randomBytes(32).toString("hex");
      await db.insert(passwordResetTokens).values({
        userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
      const resetUrl = `${getEnv().NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
      await sendEmail(user.email, `Reset your ${getEnv().STORE_NAME} password`,
        `<p>Use this link within 30 minutes to reset your password:</p><p><a href="${resetUrl}">Reset password</a></p>`);
    }
    return NextResponse.json({ message: "If an account exists for that address, a reset link has been sent." });
  } catch (error) {
    return errorResponse(error);
  }
}
