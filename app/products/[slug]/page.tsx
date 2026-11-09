import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { products } from "@/db/schema";
import { db } from "@/lib/db";
import { ProductDetail } from "@/components/product-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [product] = await db.select({ name: products.name, description: products.description })
    .from(products).where(eq(products.slug, slug)).limit(1);
  const title = product?.name || slug.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const description = product?.description || "Thoughtful everyday care from Decotrin.";
  return {
    title, description,
    openGraph: { title: `${title} | Decotrin`, description, type: "website" },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProductDetail slug={slug} />;
}
