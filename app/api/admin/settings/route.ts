import { NextResponse } from "next/server";
import { settings } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const schema = z.object({
  store_name: z.string().trim().min(2).max(120),
  free_shipping_threshold: z.coerce.number().int().min(0),
  tax_percent: z.coerce.number().min(0).max(100),
  homepage_headline: z.string().trim().max(160).optional(),
  homepage_subheadline: z.string().trim().max(300).optional(),
  homepage_primary_link: z.string().trim().max(300).optional(),
  homepage_secondary_link: z.string().trim().max(300).optional(),
  support_email: z.string().trim().email().optional().or(z.literal("")),
  support_phone: z.string().trim().max(80).optional(),
  business_address: z.string().trim().max(300).optional(),
  announcement_text: z.string().trim().max(200).optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    const rows = await db.select().from(settings);
    return NextResponse.json({ settings: Object.fromEntries(rows.map((item) => [item.key, item.value])) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    const values = schema.parse(await request.json());
    await db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(values)) {
        await tx.insert(settings).values({ key, value: String(value) }).onConflictDoUpdate({
          target: settings.key, set: { value: String(value), updatedAt: new Date() },
        });
      }
    });
    revalidatePath("/");
    return NextResponse.json({ settings: values });
  } catch (error) {
    return errorResponse(error);
  }
}
