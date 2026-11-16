import { NextResponse } from "next/server";
import { newsletterSubscribers } from "@/db/schema";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { sendEmailAfterResponse } from "@/lib/email";
import { z } from "zod";

const schema = z.object({ email: z.email() });

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
    const email = String(payload.email || "").trim().toLowerCase();
    const data = schema.parse({ email });
    await db.insert(newsletterSubscribers).values({ email: data.email }).onConflictDoNothing();
    sendEmailAfterResponse({ to: data.email, subject: "Welcome to Decotrin", text: "Thanks for joining the Decotrin list.", html: "<p>Thanks for joining the Decotrin list.</p>" });
    if (contentType.includes("application/json")) return NextResponse.json({ subscribed: true });
    return NextResponse.redirect(new URL("/?newsletter=joined", request.url), { status: 303 });
  } catch (error) {
    return errorResponse(error);
  }
}
