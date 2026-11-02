import { NextResponse } from "next/server";
import { settings } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  store_name: z.string().trim().min(2).max(120),
  shipping_charge: z.coerce.number().int().min(0),
  free_shipping_threshold: z.coerce.number().int().min(0),
  tax_percent: z.coerce.number().min(0).max(100),
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
    return NextResponse.json({ settings: values });
  } catch (error) {
    return errorResponse(error);
  }
}
