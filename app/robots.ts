import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppUrl();
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/profile", "/orders", "/checkout"] }], sitemap: `${baseUrl}/sitemap.xml` };
}
