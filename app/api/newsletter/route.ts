import { NextResponse } from "next/server";
import { newsletterSubscribers } from "@/db/schema";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { z } from "zod";

const schema = z.object({ email: z.email() });

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const data = schema.parse({ email });
    await db.insert(newsletterSubscribers).values({ email: data.email }).onConflictDoNothing();
    return NextResponse.redirect(new URL("/?newsletter=joined", request.url), { status: 303 });
  } catch (error) {
    return errorResponse(error);
  }
}
