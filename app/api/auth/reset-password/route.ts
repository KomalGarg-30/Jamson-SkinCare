import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { hash } from "bcryptjs";
import { auditLogs, passwordResetTokens, users } from "@/db/schema";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmailAfterResponse } from "@/lib/email";
import { passwordChangedEmail } from "@/lib/email-templates";
import { passwordSchema } from "@/lib/validation";
import { z } from "zod";

const schema = z.object({ resetToken: z.string().min(32).max(128), password: passwordSchema });

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    if (!await rateLimit(`reset:${ip}`, 5)) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
    const data = schema.parse(await request.json());
    const tokenHash = createHash("sha256").update(data.resetToken).digest("hex");
    const [reset] = await db.select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
      .from(passwordResetTokens).where(and(
        eq(passwordResetTokens.tokenHash, tokenHash), gt(passwordResetTokens.expiresAt, new Date()), isNull(passwordResetTokens.usedAt),
      )).limit(1);
    if (!reset) return NextResponse.json({ error: "This reset session has expired or was already used. Request a new code." }, { status: 400 });
    const passwordHash = await hash(data.password, 12);
    const email = await db.transaction(async (tx) => {
      const now = new Date();
      const [used] = await tx.update(passwordResetTokens).set({ usedAt: now, updatedAt: now }).where(and(
        eq(passwordResetTokens.id, reset.id), gt(passwordResetTokens.expiresAt, now), isNull(passwordResetTokens.usedAt),
      )).returning({ userId: passwordResetTokens.userId });
      if (!used) return null;
      const [user] = await tx.update(users).set({
        passwordHash, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: now,
      }).where(and(eq(users.id, reset.userId), eq(users.isBlocked, false), isNull(users.deletedAt)))
        .returning({ id: users.id, email: users.email });
      if (!user) return null;
      await tx.update(passwordResetTokens).set({ usedAt: now, updatedAt: now })
        .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
      await tx.insert(auditLogs).values({ actorUserId: user.id, targetUserId: user.id, action: "password_changed" });
      return user.email;
    });
    if (!email) return NextResponse.json({ error: "This reset session has expired or was already used. Request a new code." }, { status: 400 });
    const content = passwordChangedEmail();
    sendEmailAfterResponse({ to: email, ...content });
    return NextResponse.json({ message: "Password updated. You can now sign in." });
  } catch (error) {
    return errorResponse(error);
  }
}
