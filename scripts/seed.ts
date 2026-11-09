import { eq } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import { categories, productImages, products, settings } from "@/db/schema";

const categoryData = [
  { name: "Skin Care", slug: "skin-care", description: "Thoughtful daily essentials for healthy, glowing skin.", imageUrl: "/images/skin-care.svg" },
  { name: "Hair Care", slug: "hair-care", description: "Gentle care for stronger, happier hair.", imageUrl: "/images/hair-care.svg" },
  { name: "Body Care", slug: "body-care", description: "Nourishing rituals from head to toe.", imageUrl: "/images/body-care.svg" },
  { name: "Health Care", slug: "health-care", description: "Everyday wellness, made a little more mindful.", imageUrl: "/images/health-care.svg" },
];

const catalog = [
  ["Botanical Cleanser", "skin-care", "A gentle, pH-balanced daily cleanser with oat and aloe to leave skin comfortable and refreshed.", "Oat extract, aloe vera, glycerin", "Massage onto damp skin morning and evening. Rinse well.", 129900, 99900, 45, true],
  ["Dewdrop Vitamin C Serum", "skin-care", "A lightweight brightening serum made with stable vitamin C and hyaluronic acid.", "Vitamin C, hyaluronic acid, green tea", "Apply 2–3 drops to clean, dry skin each morning. Follow with SPF.", 189900, 159900, 32, true],
  ["Cloud Cream Moisturizer", "skin-care", "A cushiony, fragrance-free moisturizer that supports the skin barrier without feeling heavy.", "Ceramides, squalane, panthenol", "Smooth over face and neck after serum, morning and night.", 159900, null, 60, false],
  ["Calm Night Repair", "skin-care", "A comforting overnight cream with bakuchiol and nourishing plant oils.", "Bakuchiol, jojoba oil, niacinamide", "Use a pea-sized amount in your evening routine.", 219900, 189900, 26, true],
  ["Rosemary Scalp Tonic", "hair-care", "A refreshing leave-in tonic that helps keep the scalp balanced and hydrated.", "Rosemary water, caffeine, niacinamide", "Part hair and apply directly to scalp. Massage gently; do not rinse.", 119900, null, 38, true],
  ["Silk Repair Shampoo", "hair-care", "A sulfate-conscious shampoo that cleanses gently while helping reduce dryness.", "Argan oil, oat amino acids, aloe", "Massage into wet hair and rinse. Repeat if needed.", 109900, 89900, 54, false],
  ["Nourish Hair Mask", "hair-care", "A rich weekly treatment that adds softness and shine to dry, stressed lengths.", "Shea butter, coconut oil, hydrolyzed rice protein", "Apply to mid-lengths and ends for 5–10 minutes, then rinse.", 149900, null, 29, false],
  ["Daily Body Lotion", "body-care", "A fast-absorbing body lotion with a soft, clean finish for everyday hydration.", "Shea butter, ceramides, oat", "Apply generously to clean skin after bathing.", 99900, 79900, 72, true],
  ["Citrus Hand & Body Wash", "body-care", "A plant-derived foaming wash that leaves skin feeling clean, never tight.", "Citrus peel, glycerin, calendula", "Lather over damp skin and rinse thoroughly.", 89900, null, 81, false],
  ["Calming Body Butter", "body-care", "A velvety, deeply nourishing butter for dry areas and a slow evening ritual.", "Cocoa butter, almond oil, chamomile", "Warm between palms and massage into dry skin.", 139900, null, 33, false],
  ["Daily Wellness D3", "health-care", "A convenient vitamin D3 supplement for everyday wellness. Consult your healthcare professional before use.", "Vitamin D3 (cholecalciferol)", "Use only as directed on the label or by your healthcare professional.", 69900, null, 100, true],
  ["Herbal Sleep Tea", "health-care", "A caffeine-free botanical blend crafted for a soothing evening cup.", "Chamomile, tulsi, lemon balm", "Steep one tea bag in hot water for 4–5 minutes. Enjoy warm.", 59900, 49900, 95, false],
];

async function seed() {
  const savedCategories = new Map<string, string>();
  for (const category of categoryData) {
    const [saved] = await db.insert(categories).values(category)
      .onConflictDoUpdate({ target: categories.slug, set: { ...category, updatedAt: new Date() } })
      .returning({ id: categories.id, slug: categories.slug });
    savedCategories.set(saved.slug, saved.id);
  }
  for (let index = 0; index < catalog.length; index += 1) {
    const [name, categorySlug, description, ingredients, howToUse, price, discountPrice, stock, featured] = catalog[index] as [string, string, string, string, string, number, number | null, number, boolean];
    const sku = `JAM-${String(index + 1).padStart(4, "0")}`;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const categoryId = savedCategories.get(categorySlug);
    if (!categoryId) throw new Error(`Missing seeded category: ${categorySlug}`);
    const [product] = await db.insert(products).values({
      name, slug, categoryId, description, ingredients, howToUse, brand: "Decotrin",
      price, discountPrice, stock, sku, featured, tags: [categorySlug.replace("-", " "), "daily care"],
    }).onConflictDoUpdate({
      target: products.sku,
      set: { name, slug, categoryId, description, ingredients, howToUse, price, discountPrice, stock, featured, updatedAt: new Date() },
    }).returning({ id: products.id, name: products.name });
    const savedImages = await db.select().from(productImages).where(eq(productImages.productId, product.id));
    if (!savedImages.length || savedImages.every((image) => !image.fileId && image.url === "/images/product-default.svg")) {
      if (savedImages.length) await db.delete(productImages).where(eq(productImages.productId, product.id));
      await db.insert(productImages).values([
        { productId: product.id, url: `https://ik.imagekit.io/your_imagekit_id/skincare-store/products/${slug}-front.jpg`, fileId: null, altText: `${product.name} - sample front image`, position: 0, isMain: true },
        { productId: product.id, url: `https://ik.imagekit.io/your_imagekit_id/skincare-store/products/${slug}-detail.jpg`, fileId: null, altText: `${product.name} - sample detail image`, position: 1, isMain: false },
      ]);
    }
  }
  for (const [key, value] of [
    ["store_name", "Decotrin"], ["shipping_charge", "9900"],
    ["free_shipping_threshold", "200000"], ["tax_percent", "0"],
    ["return_window_days", process.env.RETURN_WINDOW_DAYS || "7"],
  ]) {
    await db.insert(settings).values({ key, value }).onConflictDoNothing();
  }
  console.log("Seed complete: 4 categories and 12 products are ready.");
}

seed().catch((error: unknown) => {
  console.error("Database seed failed:", error);
  process.exitCode = 1;
}).finally(async () => closeDb());
