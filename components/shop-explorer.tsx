"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProductCard, type ProductSummary } from "@/components/product-card";

type Product = ProductSummary & { rating: number; reviewCount: number; stock: number; categoryName: string };
type Result = { products: Product[]; pages: number; total: number };

export function ShopExplorer() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState(searchParams.get("sort") || "newest");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [rating, setRating] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), sort });
    if (category) params.set("category", category);
    if (q) params.set("q", q);
    if (minimum) params.set("min", String(Number(minimum) * 100));
    if (maximum) params.set("max", String(Number(maximum) * 100));
    if (rating) params.set("rating", rating);
    fetch(`/api/products?${params}`).then((response) => response.json()).then((data: Result) => {
      if (active) { setProducts(data.products || []); setPages(data.pages || 1); }
    }).catch(() => { if (active) setProducts([]); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, sort, category, q, minimum, maximum, rating]);
  return <div className="mt-10">
    <div className="mb-8 grid gap-3 rounded-2xl border border-ink/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
      <input className="field lg:col-span-2" aria-label="Search products" placeholder="Search products" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} />
      <select className="field" aria-label="Category" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
        <option value="">All categories</option><option value="skin-care">Skin care</option><option value="hair-care">Hair care</option><option value="body-care">Body care</option><option value="health-care">Health care</option>
      </select>
      <select className="field" aria-label="Sort products" value={sort} onChange={(event) => setSort(event.target.value)}>
        <option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="popular">Popularity</option>
      </select>
      <select className="field" aria-label="Minimum rating" value={rating} onChange={(event) => setRating(event.target.value)}>
        <option value="">Any rating</option><option value="3">3+ stars</option><option value="4">4+ stars</option>
      </select>
      <div className="flex gap-2"><input className="field min-w-0" type="number" min="0" aria-label="Minimum price in rupees" placeholder="Min ₹" value={minimum} onChange={(event) => setMinimum(event.target.value)} /><input className="field min-w-0" type="number" min="0" aria-label="Maximum price in rupees" placeholder="Max ₹" value={maximum} onChange={(event) => setMaximum(event.target.value)} /></div>
    </div>
    {loading ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="animate-pulse"><div className="aspect-[4/5] rounded-2xl bg-sand" /><div className="mt-4 h-4 w-2/3 rounded bg-sand" /><div className="mt-2 h-4 w-1/3 rounded bg-sand" /></div>)}</div>
      : products.length ? <><div className="mb-5 text-sm text-ink/55">{products.length} product{products.length === 1 ? "" : "s"} shown</div><div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>
        {pages > 1 && <div className="mt-10 flex justify-center gap-3"><button className="rounded-full border px-5 py-2 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span className="px-3 py-2 text-sm">Page {page} of {pages}</span><button className="rounded-full border px-5 py-2 disabled:opacity-40" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>}</>
      : <div className="rounded-2xl bg-white py-20 text-center"><h2 className="font-serif text-2xl">Nothing on the shelf just yet</h2><p className="mt-2 text-sm text-ink/60">Try another search or clear some filters.</p></div>}
  </div>;
}
