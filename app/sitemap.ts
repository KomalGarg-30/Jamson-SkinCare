import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/env";
import { db } from "@/lib/db";
import { products, categories } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getAppUrl();
  const [catalog, categoryList] = await Promise.all([
    db.select({ slug: products.slug, updatedAt: products.updatedAt }).from(products).where(eq(products.isActive, true)),
    db.select({ slug: categories.slug, updatedAt: categories.updatedAt }).from(categories).where(eq(categories.isActive, true)),
  ]);
  return [
    { url: baseUrl, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/shop`, changeFrequency: "daily", priority: 0.9 },
    ...categoryList.map((item) => ({ url: `${baseUrl}/shop?category=${item.slug}`, lastModified: item.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...catalog.map((item) => ({ url: `${baseUrl}/products/${item.slug}`, lastModified: item.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
