import { closeDb, db } from "@/lib/db";
import { categories, settings } from "@/db/schema";

const categoryData = [
  { name: "Skin Care", slug: "skin-care", description: "Thoughtful daily essentials for healthy, glowing skin.", imageUrl: "/images/skin-care.svg" },
  { name: "Hair Care", slug: "hair-care", description: "Gentle care for stronger, happier hair.", imageUrl: "/images/hair-care.svg" },
  { name: "Body Care", slug: "body-care", description: "Nourishing rituals from head to toe.", imageUrl: "/images/body-care.svg" },
  { name: "Health Care", slug: "health-care", description: "Everyday wellness, made a little more mindful.", imageUrl: "/images/health-care.svg" },
];

async function seedProduction() {
  for (const category of categoryData) {
    await db.insert(categories).values(category)
      .onConflictDoUpdate({ target: categories.slug, set: { ...category, updatedAt: new Date() } });
  }
  for (const [key, value] of [
    ["store_name", process.env.STORE_NAME || "Decotrin"],
    ["shipping_charge", "9900"],
    ["free_shipping_threshold", "200000"],
    ["tax_percent", "0"],
    ["return_window_days", process.env.RETURN_WINDOW_DAYS || "7"],
  ]) {
    await db.insert(settings).values({ key, value }).onConflictDoNothing();
  }
  console.log("Production seed complete: categories and default settings created; no demo products were inserted.");
}

seedProduction().catch((error: unknown) => {
  console.error("Production seed failed:", error);
  process.exitCode = 1;
}).finally(async () => closeDb());
