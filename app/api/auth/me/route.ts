import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ user: null });
    const [user] = await db.select({ role: users.role, isBlocked: users.isBlocked, sessionVersion: users.sessionVersion, deletedAt: users.deletedAt })
      .from(users).where(eq(users.id, session.id)).limit(1);
    if (!user || user.isBlocked || user.deletedAt || user.sessionVersion !== session.sessionVersion) return NextResponse.json({ user: null });
    return NextResponse.json({ user: { ...session, role: user.role } });
  } catch (error) {
    return errorResponse(error);
  }
}
