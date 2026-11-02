import Link from "next/link";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { ArrowRight, Leaf, ShieldCheck, Sparkles } from "lucide-react";
import { banners, categories, products } from "@/db/schema";
import { db } from "@/lib/db";
import { getSetupError } from "@/lib/env";
import { ProductCard } from "@/components/product-card";
import { SectionTitle } from "@/components/section-title";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const setupError = getSetupError();
  if (setupError) return <section className="container-page py-28 text-center"><p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Setup required</p><h1 className="mt-4 font-serif text-4xl">Add your store configuration</h1><p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-ink/60">{setupError} Review the setup steps in README.md, then restart the app.</p></section>;
  const [categoryList, featured, bestSellers, arrivals, homeBanners] = await Promise.all([
    db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.name)),
    db.select({ id: products.id, name: products.name, slug: products.slug, price: products.price, discountPrice: products.discountPrice, rating: products.rating, reviewCount: products.reviewCount, stock: products.stock, image: sql<string | null>`(SELECT url FROM product_images WHERE product_id = ${products.id} ORDER BY position ASC LIMIT 1)` })
      .from(products)
      .where(and(eq(products.featured, true), eq(products.isActive, true))).orderBy(desc(products.createdAt)).limit(4),
    db.select({ id: products.id, name: products.name, slug: products.slug, price: products.price, discountPrice: products.discountPrice, rating: products.rating, reviewCount: products.reviewCount, stock: products.stock, image: sql<string | null>`(SELECT url FROM product_images WHERE product_id = ${products.id} ORDER BY position ASC LIMIT 1)` })
      .from(products)
      .where(eq(products.isActive, true)).orderBy(desc(products.reviewCount)).limit(4),
    db.select({ id: products.id, name: products.name, slug: products.slug, price: products.price, discountPrice: products.discountPrice, rating: products.rating, reviewCount: products.reviewCount, stock: products.stock, image: sql<string | null>`(SELECT url FROM product_images WHERE product_id = ${products.id} ORDER BY position ASC LIMIT 1)` })
      .from(products)
      .where(eq(products.isActive, true)).orderBy(desc(products.createdAt)).limit(4),
    db.select().from(banners).where(eq(banners.isActive, true)).orderBy(asc(banners.position)).limit(1),
  ]);
  const hero = homeBanners[0];
  const heroHref = (() => {
    if (!hero?.linkUrl) return "/shop";
    try {
      const link = new URL(hero.linkUrl);
      return link.protocol === "https:" || link.protocol === "http:" ? link.href : "/shop";
    } catch {
      return hero.linkUrl.startsWith("/") && !hero.linkUrl.startsWith("//") ? hero.linkUrl : "/shop";
    }
  })();
  return <div>
    <section className="relative min-h-[570px] overflow-hidden bg-[#e8eee6]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_38%,#d4dfd0_0,transparent_34%)]" />
      <div className="container-page relative grid min-h-[570px] items-center gap-8 py-16 md:grid-cols-[1.05fr_.95fr]">
        <div className="max-w-xl">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[.24em] text-sage-dark">Little rituals, a lot of care</p>
          <h1 className="font-serif text-5xl leading-[1.08] text-ink sm:text-6xl">{hero?.title || "Feel good in the skin you’re in."}</h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-ink/70">{hero?.subtitle || "Thoughtfully chosen skincare, haircare and everyday wellness for the moments that are just yours."}</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link className="inline-flex items-center gap-2 rounded-full bg-sage-dark px-7 py-3.5 text-sm font-medium text-white hover:bg-ink" href={heroHref}>Explore the collection <ArrowRight size={17} /></Link><Link className="inline-flex items-center rounded-full border border-ink/20 px-7 py-3.5 text-sm font-medium" href="/shop?category=skin-care">Find your routine</Link></div>
          <p className="mt-8 flex items-center gap-2 text-sm text-ink/60"><ShieldCheck size={17} className="text-sage-dark" />Kind ingredients. Feel-good essentials.</p>
        </div>
        <div className="relative mx-auto w-full max-w-[500px]">
          <div className="absolute -left-3 top-12 h-52 w-52 rounded-full bg-[#d5c7b5]/55 blur-2xl" />
          <img src={hero?.imageUrl || "/images/product-default.svg"} alt={hero?.title || "A calm, botanical skincare arrangement"} className="relative aspect-[4/3] w-full rounded-[2rem] object-cover shadow-xl shadow-sage/10" />
          <div className="absolute -bottom-5 -left-4 rounded-2xl bg-white px-5 py-4 shadow-lg"><p className="font-serif text-lg">Your everyday, elevated</p><p className="mt-1 text-xs text-ink/55">Gentle care, made simple</p></div>
        </div>
      </div>
    </section>

    <section className="container-page py-20">
      <SectionTitle eyebrow="Find your feel-good" title="Care for every part of you" description="Explore thoughtful formulas made to fit into the routine you already love." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{categoryList.map((category) => <Link key={category.id} href={`/shop?category=${category.slug}`} className="group relative overflow-hidden rounded-2xl bg-sand">
        <img src={category.imageUrl || "/images/product-default.svg"} alt="" className="aspect-[1.25] w-full object-cover transition duration-500 group-hover:scale-105" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent p-5 pt-14 text-white"><h3 className="font-serif text-2xl">{category.name}</h3><span className="mt-2 inline-flex items-center gap-1 text-xs">Discover <ArrowRight size={14} /></span></div>
      </Link>)}</div>
    </section>

    <section className="bg-white py-20"><div className="container-page">
      <SectionTitle eyebrow="A few good things" title="Made for your daily ritual" href="/shop" />
      <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">{featured.map((product) => <ProductCard key={product.id} product={product} />)}</div>
    </div></section>

    <section className="container-page py-20"><SectionTitle eyebrow="Loved by you" title="The everyday favourites" href="/shop?sort=popular" />
      <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">{bestSellers.map((product) => <ProductCard key={product.id} product={product} />)}</div>
    </section>

    <section className="bg-[#f1ede5] py-20"><div className="container-page">
      <SectionTitle eyebrow="Just arrived" title="New to the shelf" href="/shop?sort=newest" />
      <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">{arrivals.map((product) => <ProductCard key={product.id} product={product} />)}</div>
    </div></section>

    <section className="container-page grid items-center gap-12 py-20 md:grid-cols-2">
      <div><p className="mb-3 text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">The Jamson difference</p><h2 className="font-serif text-4xl leading-tight">Care that feels like care.</h2><p className="mt-5 max-w-lg leading-7 text-ink/65">We believe a good routine should feel uncomplicated. So we choose effective, thoughtful essentials and let the little rituals do their thing.</p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2"><div className="flex gap-3"><Leaf className="shrink-0 text-sage-dark" /><div><h3 className="font-medium">Thoughtful formulas</h3><p className="mt-1 text-sm text-ink/60">Straightforward ingredients that earn their place.</p></div></div><div className="flex gap-3"><Sparkles className="shrink-0 text-sage-dark" /><div><h3 className="font-medium">Everyday easy</h3><p className="mt-1 text-sm text-ink/60">Little moments of care, without the fuss.</p></div></div></div>
      </div>
      <div className="rounded-[2rem] bg-[#e5e9df] p-8 sm:p-12"><p className="font-serif text-2xl leading-relaxed">“My routine finally feels like something I look forward to. Simple, gentle, and just right for me.”</p><div className="mt-8 flex items-center gap-3"><div className="h-11 w-11 rounded-full bg-sage/20" /><div><p className="text-sm font-semibold">A happy customer</p><p className="text-xs text-ink/55">Verified purchase</p></div></div></div>
    </section>

    <section className="container-page pb-20"><div className="rounded-[2rem] bg-sage-dark px-7 py-12 text-center text-white md:px-16">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-white/70">A little note from us</p><h2 className="mt-3 font-serif text-3xl md:text-4xl">Make room for feel-good.</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-white/75">Sign up for thoughtful notes, new arrivals and a little something for your next order.</p>
      <form action="/api/newsletter" method="post" className="mx-auto mt-7 flex max-w-md flex-col gap-2 sm:flex-row"><label htmlFor="newsletter-email" className="sr-only">Email address</label><input id="newsletter-email" type="email" name="email" required placeholder="Your email address" className="min-w-0 flex-1 rounded-full border-0 bg-white px-5 py-3 text-sm text-ink outline-none" /><button className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-white hover:bg-ink/80">Join the list</button></form>
    </div></section>
  </div>;
}
