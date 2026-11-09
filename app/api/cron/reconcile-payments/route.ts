import { NextResponse } from "next/server";
import { authorized, expirePendingOrders } from "@/app/api/cron/cleanup/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return NextResponse.json({ status: "ok", reconciled: await expirePendingOrders() });
  } catch (error) {
    console.error("Payment reconciliation failed:", { name: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Payment reconciliation could not be completed." }, { status: 500 });
  }
}
