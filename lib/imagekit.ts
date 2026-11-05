import ImageKit from "@imagekit/nodejs";
import { getEnv, requireEnv } from "@/lib/env";

export function getImageKitClient() {
  const privateKey = requireEnv("IMAGEKIT_PRIVATE_KEY");
  return new ImageKit({ privateKey });
}

export function getImageKitConfig() {
  const env = getEnv();
  const publicKey = env.IMAGEKIT_PUBLIC_KEY || env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
  const urlEndpoint = env.IMAGEKIT_URL_ENDPOINT || env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
  if (!publicKey || !urlEndpoint) {
    throw new Error("Image uploads are not configured. Add the ImageKit public key and URL endpoint to .env.");
  }
  const folder = `/${env.IMAGEKIT_UPLOAD_FOLDER.replace(/^\/+|\/+$/g, "")}`;
  return { publicKey, urlEndpoint, folder, maxImageSizeMb: env.MAX_IMAGE_SIZE_MB, maxImagesPerProduct: env.MAX_IMAGES_PER_PRODUCT };
}
