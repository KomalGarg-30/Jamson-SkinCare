import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getEnv().NEXT_PUBLIC_APP_URL;
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/profile", "/orders", "/checkout"] }], sitemap: `${baseUrl}/sitemap.xml` };
}
