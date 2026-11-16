import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { StoreImage } from "@/components/store-image";

export function CategoryCard({ category }: { category: { name: string; slug: string; imageUrl: string | null } }) {
  return <Link href={`/shop?category=${category.slug}`} className="group block overflow-hidden rounded-2xl bg-sand">
    <div className="relative aspect-[1.15] overflow-hidden">
      <StoreImage src={category.imageUrl} alt={`${category.name} collection`} width={600} height={520} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 text-white"><h3 className="font-serif text-2xl">{category.name}</h3><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink"><ArrowUpRight size={17} /></span></div>
    </div>
  </Link>;
}
