import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { passwordResetTokens, users } from "@/db/schema";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/mailer";
import { getAppUrl, getEnv } from "@/lib/env";
import { z } from "zod";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    if (!await rateLimit(`forgot:${ip}`, 4)) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    const body = z.object({ email: z.email() }).parse(await request.json());
    const email = body.email.trim().toLowerCase();
    const [user] = await db.select({ id: users.id, email: users.email }).from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt))).limit(1);
    let devResetUrl: string | undefined;
    if (user) {
      const token = randomBytes(32).toString("hex");
      await db.insert(passwordResetTokens).values({
        userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
      const resetUrl = `${getAppUrl()}/reset-password?token=${token}`;
      if (process.env.NODE_ENV === "development") {
        devResetUrl = resetUrl;
      } else {
        await sendEmail(user.email, `Reset your ${getEnv().STORE_NAME} password`,
          `<p>Use this link within 30 minutes to reset your password:</p><p><a href="${resetUrl}">Reset password</a></p>`);
      }
    }
    return NextResponse.json({
      message: devResetUrl
        ? "Open this one-time link to choose a new password. It expires in 30 minutes."
        : "If an account exists for that address, a reset link has been sent.",
      ...(devResetUrl ? { devResetUrl } : {}),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
