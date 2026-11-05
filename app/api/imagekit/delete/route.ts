import { eq } from "drizzle-orm";
import { NotFoundError } from "@imagekit/nodejs";
import { NextResponse } from "next/server";
import { productImages } from "@/db/schema";
import { errorResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getImageKitClient, getImageKitConfig } from "@/lib/imagekit";
import { z } from "zod";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const { fileId } = z.object({ fileId: z.string().min(1).max(200) }).parse(await request.json());
    const [image] = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.fileId, fileId)).limit(1);
    const imageKit = getImageKitClient();
    const config = getImageKitConfig();
    try {
      const file = await imageKit.files.get(fileId);
      if (!file.filePath?.startsWith(`${config.folder}/`)) {
        return NextResponse.json({ error: "This image is not in the product image folder." }, { status: 400 });
      }
      await imageKit.files.delete(fileId);
    } catch (error) {
      if (!(error instanceof NotFoundError) || !image) throw error;
    }
    if (image) await db.delete(productImages).where(eq(productImages.id, image.id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ImageKit image deletion failed:", error);
    return errorResponse(error);
  }
}
