import { NextResponse } from "next/server";
import { z } from "zod";
import { sendEmail } from "@/lib/email";
import { errorResponse } from "@/lib/api";
import { settings } from "@/db/schema";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
const schema = z.object({ name: z.string().trim().min(1).max(120), email: z.email(), message: z.string().trim().min(10).max(3000) });
export async function POST(request: Request) {
  try {
    const form = await request.formData(); const data = schema.parse({ name: String(form.get("name") || ""), email: String(form.get("email") || ""), message: String(form.get("message") || "") });
    const rows = await db.select().from(settings).where(eq(settings.key, "support_email"));
    const destination = rows[0]?.value || process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM;
    if (!destination) throw new Error("Support email is not configured.");
    await sendEmail({ to: destination, subject: `Contact form: ${data.name}`, text: `${data.name} (${data.email})\n\n${data.message}`, html: `<p><strong>${data.name}</strong> (${data.email})</p><p>${data.message.replace(/\n/g, "<br />")}</p>` });
    return NextResponse.json({ sent: true });
  } catch (error) { return errorResponse(error); }
}
