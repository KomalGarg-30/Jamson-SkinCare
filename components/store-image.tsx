"use client";

import { useEffect, useState } from "react";

const fallbackImage = "/images/product-default.svg";

function transformed(url: string, width: number, height: number) {
  if (!url.startsWith("https://ik.imagekit.io/")) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("tr", `w-${width},h-${height},q-80,f-auto`);
  return parsed.toString();
}

export function StoreImage({ src, alt, className = "", width = 800, height = 800, eager = false }: {
  src: string | null | undefined; alt: string; className?: string; width?: number; height?: number; eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const candidate = src || fallbackImage;
  const isLocalImage = candidate.startsWith("/") && !candidate.startsWith("//");
  const url = failed || (!isLocalImage && !candidate.startsWith("blob:") && !candidate.startsWith("https://ik.imagekit.io/"))
    ? fallbackImage
    : candidate;
  const candidates = [400, 800, 1200];
  return <img
    src={transformed(url, width, height)}
    srcSet={!failed && url.startsWith("https://ik.imagekit.io/") ? candidates.map((size) => `${transformed(url, size, Math.round(size * height / width))} ${size}w`).join(", ") : undefined}
    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
    alt={alt}
    width={width}
    height={height}
    loading={eager ? "eager" : "lazy"}
    decoding="async"
    onError={() => setFailed(true)}
    className={className}
  />;
}
