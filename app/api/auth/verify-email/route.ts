import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { auditLogs, emailOtps, users } from "@/db/schema";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { clearOtpFlow, OtpError, requireOtpFlow, verifyOtp } from "@/lib/otp";
import { welcomeEmail } from "@/lib/email-templates";
import { sendEmailAfterResponse } from "@/lib/email";
import { z } from "zod";

const schema = z.object({ email: z.email().transform((value) => value.trim().toLowerCase()), code: z.string().regex(/^\d{4,8}$/) });

export async function POST(request: Request) {
  try {
    const data = schema.parse(await request.json());
    await requireOtpFlow(data.email, "signup");
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const otp = await verifyOtp(data.email, "signup", data.code, ip);
    const user = await db.transaction(async (tx) => {
      const now = new Date();
      const [used] = await tx.update(emailOtps).set({ usedAt: now })
        .where(and(eq(emailOtps.id, otp.id), isNull(emailOtps.usedAt))).returning({ id: emailOtps.id });
      if (!used) throw new OtpError("This code has already been used. Request a new code to continue.", 400);
      const [verified] = await tx.update(users).set({ emailVerified: true, emailVerifiedAt: now, updatedAt: now })
        .where(and(eq(users.email, data.email), eq(users.emailVerified, false), eq(users.isBlocked, false), isNull(users.deletedAt)))
        .returning({
          id: users.id, email: users.email, name: users.name, role: users.role, sessionVersion: users.sessionVersion,
        });
      if (!verified) throw new OtpError("This account is unavailable. Please contact support.", 403);
      await tx.insert(auditLogs).values({ actorUserId: verified.id, targetUserId: verified.id, action: "signup" });
      return verified;
    });
    await clearOtpFlow();
    await createSession(user);
    const welcome = welcomeEmail(user.name);
    sendEmailAfterResponse({ to: user.email, ...welcome });
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    if (error instanceof OtpError) return NextResponse.json({ error: error.message }, { status: error.status });
    return errorResponse(error);
  }
}
