import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auditLogs, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { db } from "@/lib/db";
import { issueOtp, OtpError, rateLimitOtp } from "@/lib/otp";
import { z } from "zod";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const parsedId = z.uuid().safeParse(id);
    if (!parsedId.success) return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
    const [user] = await db.select({
      id: users.id, email: users.email, deletedAt: users.deletedAt, isBlocked: users.isBlocked, emailVerified: users.emailVerified,
    }).from(users).where(eq(users.id, parsedId.data)).limit(1);
    if (!user || user.deletedAt || user.isBlocked || !user.emailVerified) {
      return NextResponse.json({ error: "User not found or unavailable." }, { status: 404 });
    }
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    await rateLimitOtp(user.email, ip, "send");
    await issueOtp(user.email, "password_reset", ip);
    await db.insert(auditLogs).values({
      actorUserId: admin.id, targetUserId: user.id, action: "password_reset_otp_sent",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OtpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return errorResponse(error);
  }
}
