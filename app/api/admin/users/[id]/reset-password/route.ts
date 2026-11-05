import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auditLogs, passwordResetTokens, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { getAppUrl, getEnv } from "@/lib/env";
import { sendEmail } from "@/lib/mailer";
import { db } from "@/lib/db";
import { z } from "zod";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const parsedId = z.uuid().safeParse(id);
    if (!parsedId.success) return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
    const [user] = await db.select({ id: users.id, email: users.email, deletedAt: users.deletedAt })
      .from(users).where(eq(users.id, parsedId.data)).limit(1);
    if (!user || user.deletedAt) return NextResponse.json({ error: "User not found." }, { status: 404 });
    const token = randomBytes(32).toString("hex");
    await db.insert(passwordResetTokens).values({
      userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    const url = `${getAppUrl()}/reset-password?token=${token}`;
    await sendEmail(user.email, `Reset your ${getEnv().STORE_NAME} password`,
      `<p>An administrator requested a password reset for your account.</p><p><a href="${url}">Reset password</a></p><p>This link expires in 30 minutes.</p>`);
    await db.insert(auditLogs).values({
      actorUserId: admin.id, targetUserId: user.id, action: "password_reset_sent",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
