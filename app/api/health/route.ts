import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: "ok", timestamp: new Date().toISOString(), database: "connected" });
  } catch (error) {
    console.error("Health check database query failed:", error);
    return NextResponse.json(
      { status: "error", timestamp: new Date().toISOString(), database: "unavailable" },
      { status: 503 },
    );
  }
}
