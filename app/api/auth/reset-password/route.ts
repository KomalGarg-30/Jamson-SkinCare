import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { passwordResetTokens, users } from "@/db/schema";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const schema = z.object({ token: z.string().min(32), password: z.string().min(10).max(128) });

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    if (!rateLimit(`reset:${ip}`, 5)) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
    const data = schema.parse(await request.json());
    const tokenHash = createHash("sha256").update(data.token).digest("hex");
    const [reset] = await db.select().from(passwordResetTokens).where(and(
      eq(passwordResetTokens.tokenHash, tokenHash), gt(passwordResetTokens.expiresAt, new Date()), isNull(passwordResetTokens.usedAt),
    )).limit(1);
    if (!reset) return NextResponse.json({ error: "This reset link has expired or was already used." }, { status: 400 });
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: await hash(data.password, 12), updatedAt: new Date() })
        .where(eq(users.id, reset.userId));
      await tx.update(passwordResetTokens).set({ usedAt: new Date(), updatedAt: new Date() })
        .where(eq(passwordResetTokens.id, reset.id));
    });
    return NextResponse.json({ message: "Password updated. You can now sign in." });
  } catch (error) {
    return errorResponse(error);
  }
}
