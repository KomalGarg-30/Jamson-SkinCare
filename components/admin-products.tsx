"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
import { formatPrice } from "@/lib/utils";

type Category = { id: string; name: string };
type Product = { id: string; name: string; slug: string; sku: string; price: number; stock: number; isActive: boolean; featured: boolean; categoryId: string; brand: string; description: string; ingredients: string | null; howToUse: string | null; discountPrice: number | null; tags: string[] };
type UploadConfig = { timestamp: number; signature: string; cloudName: string; apiKey: string; folder: string };

export function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "price" | "stock">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();
  const load = useCallback(async () => {
    const [productResponse, categoryResponse] = await Promise.all([fetch(`/api/admin/products?page=${page}&q=${encodeURIComponent(query)}`), fetch("/api/admin/categories")]);
    const [productData, categoryData] = await Promise.all([productResponse.json(), categoryResponse.json()]);
    setProducts(productData.products || []); setCategories(categoryData.categories || []); setPages(productData.pages || 1);
    if (!productResponse.ok) setError(productData.error || "Unable to load products.");
  }, [page, query]);
  useEffect(() => { void load(); }, [load]);
  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return [];
    const signatureResponse = await fetch("/api/admin/upload-signature", { method: "POST" });
    const config: UploadConfig & { error?: string } = await signatureResponse.json();
    if (!signatureResponse.ok) throw new Error(config.error || "Image upload is not configured.");
    return Promise.all(Array.from(files).map(async (file) => {
      const form = new FormData();
      form.set("file", file); form.set("api_key", config.apiKey); form.set("timestamp", String(config.timestamp));
      form.set("signature", config.signature); form.set("folder", config.folder);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`, { method: "POST", body: form });
      const result: { secure_url?: string; error?: { message?: string } } = await response.json();
      if (!response.ok || !result.secure_url) throw new Error(result.error?.message || "A product image could not be uploaded.");
      return { url: result.secure_url, alt: file.name };
    }));
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const form = event.currentTarget;
      const fields = new FormData(form);
      const price = Math.round(Number(fields.get("price")) * 100);
      const discountPrice = fields.get("discountPrice") ? Math.round(Number(fields.get("discountPrice")) * 100) : null;
      if (discountPrice !== null && discountPrice >= price) {
        setError("Sale price must be less than the regular price.");
        return;
      }
      const images = await uploadFiles(fields.get("images") as FileList | null);
      const body: Record<string, unknown> = {
        name: String(fields.get("name")),
        description: String(fields.get("description")), ingredients: String(fields.get("ingredients") || ""),
        howToUse: String(fields.get("howToUse") || ""), categoryId: String(fields.get("categoryId")),
        brand: String(fields.get("brand")), sku: String(fields.get("sku")),
        price,
        discountPrice,
        stock: Number(fields.get("stock")), featured: fields.get("featured") === "on",
        isActive: editing?.isActive ?? true, tags: String(fields.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean),
        ...(images.length ? { images } : {}),
      };
      const slug = String(fields.get("slug") || "").trim();
      if (slug) body.slug = slug;
      if (editing) body.id = editing.id;
      const response = await fetch("/api/admin/products", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Product could not be saved.");
      toast(editing ? "Product updated." : "Product created.");
      setEditing(null); form.reset(); await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Product could not be saved.");
    } finally { setBusy(false); }
  }
  async function changeProduct(product: Product, updates: Record<string, unknown>) {
    const response = await fetch("/api/admin/products", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: product.id, ...updates }) });
    const data = await response.json();
    if (!response.ok) { toast(data.error || "Could not update product.", "error"); return; }
    toast("Product updated."); await load();
  }
  async function deleteProduct(product: Product) {
    if (!window.confirm(`Permanently delete ${product.name}?`)) return;
    const response = await fetch(`/api/admin/products?id=${product.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) { toast(data.error || "Could not delete product.", "error"); return; }
    toast("Product deleted."); await load();
  }
  const sortedProducts = useMemo(() => [...products].sort((a, b) => {
    const result = sortKey === "name" ? a.name.localeCompare(b.name) : a[sortKey] - b[sortKey];
    return result * (sortDirection === "asc" ? 1 : -1);
  }), [products, sortKey, sortDirection]);
  return <section><p className="text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">Store management</p><h1 className="mt-2 font-serif text-4xl">Products</h1>
    <input className="field mt-5 max-w-sm" aria-label="Search products" placeholder="Search product names" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
    <form key={editing?.id || "new"} onSubmit={submit} className="mt-6 grid gap-3 rounded-2xl bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
      <h2 className="font-serif text-xl sm:col-span-2 lg:col-span-3">{editing ? `Edit ${editing.name}` : "Add a product"}</h2>
      <input className="field" name="name" required minLength={2} placeholder="Product name" defaultValue={editing?.name || ""} />
      <input className="field" name="slug" placeholder="Product slug (optional)" defaultValue={editing?.slug || ""} />
      <input className="field" name="brand" required placeholder="Brand" defaultValue={editing?.brand || ""} />
      <select className="field" name="categoryId" required defaultValue={editing?.categoryId || ""}><option value="" disabled>Choose category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
      <label className="grid gap-1 text-sm">SKU<input className="field" name="sku" required minLength={2} placeholder="Unique SKU" defaultValue={editing?.sku || ""} /><span className="text-xs text-ink/55">Must be unique for each product.</span></label>
      <label className="grid gap-1 text-sm">Regular price (₹)<input className="field" name="price" type="number" min="0.01" step="0.01" required placeholder="Regular price" defaultValue={editing ? (editing.price / 100).toFixed(2) : ""} /></label>
      <label className="grid gap-1 text-sm">Sale price (₹)<input className="field" name="discountPrice" type="number" min="0.01" step="0.01" placeholder="Optional sale price" defaultValue={editing?.discountPrice ? (editing.discountPrice / 100).toFixed(2) : ""} /><span className="text-xs text-ink/55">Must be less than the regular price.</span></label>
      <input className="field" name="stock" type="number" min="0" required placeholder="Stock quantity" defaultValue={editing?.stock ?? 0} />
      <input className="field" name="tags" placeholder="Tags, comma separated" defaultValue={editing?.tags.join(", ") || ""} />
      <textarea className="field sm:col-span-2 lg:col-span-3" name="description" rows={3} minLength={10} required placeholder="Product description" defaultValue={editing?.description || ""} />
      <input className="field" name="ingredients" placeholder="Ingredients" defaultValue={editing?.ingredients || ""} /><input className="field" name="howToUse" placeholder="How to use" defaultValue={editing?.howToUse || ""} />
      <label className="grid gap-1 text-xs text-ink/60">Product images (multiple)<input type="file" name="images" accept="image/*" multiple className="field text-sm" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="featured" defaultChecked={editing?.featured} /> Featured on home page</label>
      {error && <p role="alert" className="text-sm text-rose-800 sm:col-span-2 lg:col-span-3">{error}</p>}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-3"><Button disabled={busy}>{busy ? "Saving…" : editing ? "Save product" : "Create product"}</Button>{editing && <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel edit</Button>}</div>
    </form>
    <div className="mt-6 overflow-x-auto rounded-2xl bg-white">{!products.length ? <p className="p-10 text-center text-sm text-ink/55">No products available. Run <code>npm run db:seed</code> or create your first product.</p> : <table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-ink/10 bg-sand/50"><tr>{[["name", "Product"], ["sku", "SKU"], ["price", "Price"], ["stock", "Stock"], ["isActive", "Status"], ["actions", "Actions"]].map(([key, label]) => <th className="px-4 py-3 font-medium" key={key}>{["name", "price", "stock"].includes(key) ? <button onClick={() => { setSortKey(key as "name" | "price" | "stock"); setSortDirection(sortDirection === "asc" ? "desc" : "asc"); }}>{label}{sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}</button> : label}</th>)}</tr></thead><tbody className="divide-y divide-ink/10">{sortedProducts.map((product) => <tr key={product.id}><td className="px-4 py-3 font-medium">{product.name}</td><td className="px-4 py-3">{product.sku}</td><td className="px-4 py-3">{formatPrice(product.price)}</td><td className="px-4 py-3">{product.stock}</td><td className="px-4 py-3">{product.isActive ? "Active" : "Inactive"}</td><td className="flex gap-3 px-4 py-3"><button className="text-xs text-sage-dark underline" onClick={() => setEditing(product)}>Edit</button><button className="text-xs text-sage-dark underline" onClick={() => changeProduct(product, { isActive: !product.isActive })}>{product.isActive ? "Deactivate" : "Activate"}</button><button className="text-xs text-rose-800 underline" onClick={() => deleteProduct(product)}>Delete</button></td></tr>)}</tbody></table>}</div>
    {pages > 1 && <div className="mt-4 flex items-center justify-center gap-4"><button className="rounded-full border px-4 py-2 text-sm disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span className="text-sm text-ink/60">Page {page} of {pages}</span><button className="rounded-full border px-4 py-2 text-sm disabled:opacity-40" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>}
  </section>;
}
