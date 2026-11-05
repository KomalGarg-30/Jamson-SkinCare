import type { NextConfig } from "next";

const imageKitEndpoint = process.env.IMAGEKIT_URL_ENDPOINT || process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
let imageKitHost = "ik.imagekit.io";
if (imageKitEndpoint) {
  try {
    imageKitHost = new URL(imageKitEndpoint).hostname;
  } catch {
    console.error("IMAGEKIT_URL_ENDPOINT must be a valid URL; using the default ImageKit host.");
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: { NEXT_PUBLIC_CURRENCY: process.env.CURRENCY || "INR" },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: imageKitHost },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
