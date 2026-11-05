"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
import { formatPrice } from "@/lib/utils";
import { StoreImage } from "@/components/store-image";

type Category = { id: string; name: string };
type ProductImage = { id?: string; url: string; fileId: string | null; altText: string; position?: number; isMain?: boolean };
type Product = { id: string; name: string; slug: string; sku: string; price: number; stock: number; isActive: boolean; featured: boolean; categoryId: string; brand: string; description: string; ingredients: string | null; howToUse: string | null; discountPrice: number | null; tags: string[]; images?: ProductImage[] };
type ImageItem = { key: string; url: string; fileId: string; altText: string; status: "uploading" | "uploaded" | "error"; progress: number; file?: File; previewUrl?: string; error?: string };
type UploadConfig = { token: string; expire: number; signature: string; publicKey: string; urlEndpoint: string; folder: string; maxImageSizeMb: number; maxImagesPerProduct: number };

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
  const [images, setImages] = useState<ImageItem[]>([]);
  const [maxImages, setMaxImages] = useState(8);
  const fileInput = useRef<HTMLInputElement>(null);
  const [draggedImage, setDraggedImage] = useState<string | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();
  const load = useCallback(async () => {
    const [productResponse, categoryResponse] = await Promise.all([fetch(`/api/admin/products?page=${page}&q=${encodeURIComponent(query)}`), fetch("/api/admin/categories")]);
    const [productData, categoryData] = await Promise.all([productResponse.json(), categoryResponse.json()]);
    setProducts(productData.products || []); setCategories(categoryData.categories || []); setPages(productData.pages || 1);
    if (!productResponse.ok) setError(productData.error || "Unable to load products.");
  }, [page, query]);
  useEffect(() => { void load(); }, [load]);
  async function uploadFiles(selectedFiles: FileList | File[], retryKey?: string) {
    const files = Array.from(selectedFiles);
    if (!files.length) return;
    let config: UploadConfig;
    try {
      const signatureResponse = await fetch("/api/imagekit/auth", { method: "POST" });
      const result: UploadConfig & { error?: string } = await signatureResponse.json();
      if (!signatureResponse.ok) throw new Error(result.error || "ImageKit uploads are not configured.");
      config = result;
      setMaxImages(config.maxImagesPerProduct);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "ImageKit uploads are not configured.";
      if (retryKey) setImages((current) => current.map((image) => image.key === retryKey ? { ...image, status: "error", error: message } : image));
      else setError(message);
      return;
    }
    if (files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setError("Choose JPG, PNG, or WEBP images only.");
      return;
    }
    if (files.some((file) => file.size > config.maxImageSizeMb * 1024 * 1024)) {
      setError(`Each image must be no larger than ${config.maxImageSizeMb} MB.`);
      return;
    }
    const newItems = retryKey ? [] : files.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      return {
        key: crypto.randomUUID(), url: previewUrl, fileId: "", altText: file.name.replace(/\.[^.]+$/, ""),
        status: "uploading" as const, progress: 0, file, previewUrl,
      };
    });
    if (!retryKey) {
      if (images.length + files.length > config.maxImagesPerProduct) {
        newItems.forEach((image) => { if (image.previewUrl) URL.revokeObjectURL(image.previewUrl); });
        setError(`A product can have up to ${config.maxImagesPerProduct} images.`);
        return;
      }
      setError("");
      setImages((current) => [...current, ...newItems]);
    }
    const uploads = retryKey
      ? files.map((file) => ({ file, key: retryKey }))
      : newItems.map((image) => ({ file: image.file!, key: image.key }));
    if (retryKey) setImages((current) => current.map((image) => image.key === retryKey ? { ...image, status: "uploading", progress: 0, error: undefined } : image));
    await Promise.all(uploads.map(({ file, key }) => new Promise<void>((resolve) => {
      const body = new FormData();
      body.set("file", file);
      body.set("fileName", file.name);
      body.set("publicKey", config.publicKey);
      body.set("token", config.token);
      body.set("expire", String(config.expire));
      body.set("signature", config.signature);
      body.set("folder", config.folder);
      const request = new XMLHttpRequest();
      request.open("POST", "https://upload.imagekit.io/api/v1/files/upload");
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) setImages((current) => current.map((image) => image.key === key ? { ...image, progress: Math.round(event.loaded / event.total * 100) } : image));
      };
      request.onload = () => {
        try {
          const result = JSON.parse(request.responseText) as { url?: string; fileId?: string; message?: string };
          if (request.status < 200 || request.status >= 300 || !result.url || !result.fileId) throw new Error(result.message || "ImageKit could not upload this image.");
          setImages((current) => current.map((image) => {
            if (image.key !== key) return image;
            if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
            return { ...image, url: result.url!, fileId: result.fileId!, status: "uploaded", progress: 100, file: undefined, previewUrl: undefined, error: undefined };
          }));
        } catch (reason) {
          setImages((current) => current.map((image) => image.key === key ? { ...image, status: "error", error: reason instanceof Error ? reason.message : "Image upload failed." } : image));
        }
        resolve();
      };
      request.onerror = () => {
        setImages((current) => current.map((image) => image.key === key ? { ...image, status: "error", error: "Network error while uploading. Retry this image." } : image));
        resolve();
      };
      request.send(body);
    })));
  }
  async function removeImage(image: ImageItem) {
    if (!window.confirm("Remove this image from ImageKit and the product?")) return;
    if (image.fileId) {
      try {
        const response = await fetch("/api/imagekit/delete", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileId: image.fileId }),
        });
        const result = await response.json();
        if (!response.ok) { toast(result.error || "Image could not be deleted.", "error"); return; }
      } catch {
        toast("Could not reach ImageKit to delete this image.", "error");
        return;
      }
      if (editing) {
        setEditing((current) => current ? {
          ...current,
          images: current.images?.filter((item) => item.fileId !== image.fileId),
        } : current);
        setProducts((current) => current.map((product) => product.id === editing.id
          ? { ...product, images: product.images?.filter((item) => item.fileId !== image.fileId) }
          : product));
      }
    }
    if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
    setImages((current) => current.filter((entry) => entry.key !== image.key));
  }
  async function discardNewUploads() {
    const savedIds = new Set(editing?.images?.map((image) => image.fileId).filter((fileId): fileId is string => Boolean(fileId)) || []);
    const orphaned = images.filter((image) => image.fileId && !savedIds.has(image.fileId));
    const results = await Promise.all(orphaned.map(async (image) => {
      try {
        const response = await fetch("/api/imagekit/delete", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileId: image.fileId }),
        });
        return response.ok;
      } catch {
        return false;
      }
    }));
    images.forEach((image) => { if (image.previewUrl) URL.revokeObjectURL(image.previewUrl); });
    if (results.some((success) => !success)) toast("Some newly uploaded images could not be deleted; remove them from ImageKit later.", "error");
  }
  async function beginEdit(product: Product) {
    if (images.some((image) => image.status === "uploading")) {
      toast("Wait for image uploads to finish before changing products.", "error");
      return;
    }
    await discardNewUploads();
    setEditing(product);
    setImages((product.images || []).map((image) => ({
      key: image.fileId || image.id || crypto.randomUUID(), url: image.url, fileId: image.fileId || "",
      altText: image.altText || "", status: image.fileId ? "uploaded" : "error", progress: 100,
      ...(!image.fileId ? { error: "Sample image: replace it with an ImageKit upload before saving." } : {}),
    })));
  }
  function reorderImage(sourceKey: string, targetKey: string) {
    setImages((current) => {
      const sourceIndex = current.findIndex((image) => image.key === sourceKey);
      const targetIndex = current.findIndex((image) => image.key === targetKey);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const reordered = [...current];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      return reordered;
    });
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (images.some((image) => image.status !== "uploaded")) throw new Error("Wait for all image uploads to finish or retry failed uploads.");
      const form = event.currentTarget;
      const fields = new FormData(form);
      if (fields.get("isActive") === "on" && images.length === 0) {
        throw new Error("Add at least one product image before publishing. You can uncheck Publish product to save it as a draft.");
      }
      const price = Math.round(Number(fields.get("price")) * 100);
      const discountPrice = fields.get("discountPrice") ? Math.round(Number(fields.get("discountPrice")) * 100) : null;
      if (discountPrice !== null && discountPrice >= price) {
        setError("Sale price must be less than the regular price.");
        return;
      }
      const body: Record<string, unknown> = {
        name: String(fields.get("name")),
        description: String(fields.get("description")), ingredients: String(fields.get("ingredients") || ""),
        howToUse: String(fields.get("howToUse") || ""), categoryId: String(fields.get("categoryId")),
        brand: String(fields.get("brand")), sku: String(fields.get("sku")),
        price,
        discountPrice,
        stock: Number(fields.get("stock")), featured: fields.get("featured") === "on",
        isActive: fields.get("isActive") === "on", tags: String(fields.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean),
        images: images.map(({ url, fileId, altText }) => ({ url, fileId, altText })),
      };
      const slug = String(fields.get("slug") || "").trim();
      if (slug) body.slug = slug;
      if (editing) body.id = editing.id;
      const response = await fetch("/api/admin/products", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Product could not be saved.");
      toast(editing ? "Product updated." : "Product created.");
      setEditing(null); setImages([]); form.reset(); await load();
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
      <p className="text-xs text-ink/60 sm:col-span-2 lg:col-span-3"><span className="font-semibold text-rose-700">*</span> Required field. Other fields are optional.</p>
      <label className="grid gap-1 text-sm"><span>Product name <Required /></span><input className="field" name="name" required minLength={2} placeholder="e.g. Botanical Cleanser" defaultValue={editing?.name || ""} /></label>
      <label className="grid gap-1 text-sm"><span>Product slug <Optional /></span><input className="field" name="slug" placeholder="Auto-created from product name" defaultValue={editing?.slug || ""} /><span className="text-xs text-ink/55">Used in the product page link. Leave blank to create it automatically.</span></label>
      <label className="grid gap-1 text-sm"><span>Brand <Required /></span><input className="field" name="brand" required placeholder="e.g. Jamson" defaultValue={editing?.brand || ""} /></label>
      <label className="grid gap-1 text-sm"><span>Category <Required /></span><select className="field" name="categoryId" required defaultValue={editing?.categoryId || ""}><option value="" disabled>Choose a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm"><span>SKU / product code <Required /></span><input className="field" name="sku" required minLength={2} placeholder="e.g. JAM-0001" defaultValue={editing?.sku || ""} /><span className="text-xs text-ink/55">Your own unique code; it cannot be used for another product.</span></label>
      <label className="grid gap-1 text-sm"><span>Regular price (₹) <Required /></span><input className="field" name="price" type="number" min="0.01" step="0.01" required placeholder="e.g. 499" defaultValue={editing ? (editing.price / 100).toFixed(2) : ""} /></label>
      <label className="grid gap-1 text-sm"><span>Sale price (₹) <Optional /></span><input className="field" name="discountPrice" type="number" min="0.01" step="0.01" placeholder="Leave blank if no sale" defaultValue={editing?.discountPrice ? (editing.discountPrice / 100).toFixed(2) : ""} /><span className="text-xs text-ink/55">If entered, it must be lower than the regular price.</span></label>
      <label className="grid gap-1 text-sm"><span>Stock quantity (units) <Required /></span><input className="field" name="stock" type="number" min="0" required placeholder="e.g. 25" defaultValue={editing ? editing.stock : ""} /><span className="text-xs text-ink/55">How many units are available to sell. Enter 0 if sold out.</span></label>
      <label className="grid gap-1 text-sm"><span>Product tags <Optional /></span><input className="field" name="tags" placeholder="e.g. cleanser, hydrating, sensitive skin" defaultValue={editing?.tags.join(", ") || ""} /><span className="text-xs text-ink/55">Optional search keywords. Separate each tag with a comma.</span></label>
      <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-3"><span>Product description <Required /></span><textarea className="field" name="description" rows={3} minLength={10} required placeholder="Describe what the product is and what it does." defaultValue={editing?.description || ""} /></label>
      <label className="grid gap-1 text-sm"><span>Ingredients <Optional /></span><input className="field" name="ingredients" placeholder="e.g. Aloe vera, glycerin" defaultValue={editing?.ingredients || ""} /></label>
      <label className="grid gap-1 text-sm"><span>How to use <Optional /></span><input className="field" name="howToUse" placeholder="Directions for use" defaultValue={editing?.howToUse || ""} /></label>
      <div className="grid gap-3 sm:col-span-2 lg:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">Product images</h3><span className="text-xs text-ink/55">{images.length}/{maxImages} · JPG, PNG, WEBP · first image is the cover</span></div>
        <p className="text-xs text-ink/55">At least one image is needed to publish. Draft products can be saved without images.</p>
        <div className="rounded-xl border-2 border-dashed border-sage/50 bg-cream p-5 text-center"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); if (!busy) void uploadFiles(event.dataTransfer.files); }}>
          <p className="text-sm text-ink/65">Drag and drop images here</p>
          <button type="button" className="mt-2 text-sm text-sage-dark underline" onClick={() => fileInput.current?.click()}>Choose files</button>
          <input ref={fileInput} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple hidden
            disabled={busy || images.length >= maxImages} onChange={(event) => { if (event.target.files) void uploadFiles(event.target.files); event.target.value = ""; }} />
        </div>
        {!!images.length && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {images.map((image, index) => <div key={image.key} draggable={image.status === "uploaded"}
            onDragStart={() => setDraggedImage(image.key)} onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); if (draggedImage) reorderImage(draggedImage, image.key); setDraggedImage(null); }}
            className="rounded-xl border border-ink/10 bg-white p-2">
            <div className="relative aspect-square overflow-hidden rounded-lg bg-sand">
              <StoreImage src={image.previewUrl || image.url} alt={image.altText} width={400} height={400} className="h-full w-full object-cover" />
              {index === 0 && <span className="absolute left-2 top-2 rounded-full bg-sage-dark px-2 py-1 text-[10px] text-white">Main image</span>}
            </div>
            <input aria-label="Image alt text" className="field mt-2 py-2 text-xs" maxLength={255} placeholder="Alt text (optional)"
              value={image.altText} onChange={(event) => setImages((current) => current.map((item) => item.key === image.key ? { ...item, altText: event.target.value } : item))} />
            {image.status === "uploading" && <div className="mt-2"><div className="h-1.5 overflow-hidden rounded-full bg-sand"><div className="h-full bg-sage-dark transition-all" style={{ width: `${image.progress}%` }} /></div><p className="mt-1 text-xs text-ink/55">Uploading {image.progress}%</p></div>}
            {image.status === "error" && <div className="mt-2 text-xs text-rose-800"><p>{image.error}</p><button type="button" className="mt-1 underline" disabled={!image.file} onClick={() => image.file && void uploadFiles([image.file], image.key)}>Retry</button></div>}
            {image.status === "uploaded" && <p className="mt-2 text-xs text-emerald-700">Uploaded successfully</p>}
            <div className="mt-2 flex justify-between gap-2 text-xs">
              {index > 0 && <button type="button" disabled={image.status !== "uploaded"} className="text-sage-dark underline disabled:opacity-40"
                onClick={() => reorderImage(image.key, images[0].key)}>Set as main</button>}
              <div className="flex gap-2">
                {index > 0 && <button type="button" disabled={image.status !== "uploaded"} className="text-ink/60 underline disabled:opacity-40" onClick={() => reorderImage(image.key, images[index - 1].key)}>Move earlier</button>}
                {index < images.length - 1 && <button type="button" disabled={image.status !== "uploaded"} className="text-ink/60 underline disabled:opacity-40" onClick={() => reorderImage(image.key, images[index + 1].key)}>Move later</button>}
              </div>
              <button type="button" className="ml-auto text-rose-800 underline" onClick={() => void removeImage(image)}>Remove</button>
            </div>
          </div>)}
        </div>}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="featured" defaultChecked={editing?.featured} /> Feature this product on the home page <Optional /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} /> Publish product <span className="text-xs text-ink/55">(unchecked = save as draft)</span></label>
      {error && <p role="alert" className="text-sm text-rose-800 sm:col-span-2 lg:col-span-3">{error}</p>}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-3"><Button disabled={busy || images.some((image) => image.status === "uploading")}>{busy ? "Saving…" : editing ? "Save product" : "Create product"}</Button><Button type="button" variant="secondary" disabled={busy || images.some((image) => image.status === "uploading")} onClick={(event) => { void discardNewUploads(); setEditing(null); setImages([]); event.currentTarget.form?.reset(); }}>Cancel</Button></div>
    </form>
    <div className="mt-6 overflow-x-auto rounded-2xl bg-white">{!products.length ? <p className="p-10 text-center text-sm text-ink/55">No products available. Run <code>npm run db:seed</code> or create your first product.</p> : <table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-ink/10 bg-sand/50"><tr>{[["name", "Product"], ["sku", "SKU"], ["price", "Price"], ["stock", "Stock"], ["isActive", "Status"], ["actions", "Actions"]].map(([key, label]) => <th className="px-4 py-3 font-medium" key={key}>{["name", "price", "stock"].includes(key) ? <button onClick={() => { setSortKey(key as "name" | "price" | "stock"); setSortDirection(sortDirection === "asc" ? "desc" : "asc"); }}>{label}{sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}</button> : label}</th>)}</tr></thead><tbody className="divide-y divide-ink/10">{sortedProducts.map((product) => <tr key={product.id}><td className="px-4 py-3 font-medium"><div className="flex items-center gap-3">{product.images?.[0] && <StoreImage src={product.images[0].url} alt="" width={80} height={80} className="h-10 w-10 rounded object-cover" />}{product.name}</div></td><td className="px-4 py-3">{product.sku}</td><td className="px-4 py-3">{formatPrice(product.price)}</td><td className="px-4 py-3">{product.stock}</td><td className="px-4 py-3">{product.isActive ? "Active" : "Inactive"}</td><td className="flex gap-3 px-4 py-3"><button className="text-xs text-sage-dark underline" onClick={() => void beginEdit(product)}>Edit</button><button className="text-xs text-sage-dark underline" onClick={() => changeProduct(product, { isActive: !product.isActive })}>{product.isActive ? "Deactivate" : "Activate"}</button><button className="text-xs text-rose-800 underline" onClick={() => deleteProduct(product)}>Delete</button></td></tr>)}</tbody></table>}</div>
    {pages > 1 && <div className="mt-4 flex items-center justify-center gap-4"><button className="rounded-full border px-4 py-2 text-sm disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span className="text-sm text-ink/60">Page {page} of {pages}</span><button className="rounded-full border px-4 py-2 text-sm disabled:opacity-40" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>}
  </section>;
}

function Required() {
  return <span aria-label="required" className="ml-0.5 font-semibold text-rose-700">*</span>;
}

function Optional() {
  return <span className="ml-1 text-xs font-normal text-ink/50">optional</span>;
}
