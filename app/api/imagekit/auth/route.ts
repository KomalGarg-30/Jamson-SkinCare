import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { getImageKitClient, getImageKitConfig } from "@/lib/imagekit";

export async function POST() {
  try {
    await requireAdmin();
    const config = getImageKitConfig();
    const authentication = getImageKitClient().helper.getAuthenticationParameters();
    return NextResponse.json({ ...authentication, publicKey: config.publicKey, urlEndpoint: config.urlEndpoint,
      folder: config.folder, maxImageSizeMb: config.maxImageSizeMb, maxImagesPerProduct: config.maxImagesPerProduct });
  } catch (error) {
    console.error("ImageKit upload authentication failed:", error);
    return errorResponse(error);
  }
}
