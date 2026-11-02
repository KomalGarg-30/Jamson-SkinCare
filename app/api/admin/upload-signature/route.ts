import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/api";

export async function POST() {
  try {
    await requireAdmin();
    const cloudName = requireEnv("CLOUDINARY_CLOUD_NAME");
    const apiKey = requireEnv("CLOUDINARY_API_KEY");
    const apiSecret = requireEnv("CLOUDINARY_API_SECRET");
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request({ timestamp, folder: "jamson/products" }, apiSecret);
    return NextResponse.json({ timestamp, signature, cloudName, apiKey, folder: "jamson/products" });
  } catch (error) {
    return errorResponse(error);
  }
}
