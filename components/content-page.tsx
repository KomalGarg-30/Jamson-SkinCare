import Link from "next/link";

export function ContentPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return <article className="container-page max-w-3xl py-16"><p className="eyebrow">Decotrin</p><h1 className="mt-3 font-serif text-5xl">{title}</h1><p className="mt-5 text-lg leading-8 text-ink/65">{intro}</p><div className="prose prose-neutral mt-10 max-w-none text-[16px] leading-8 text-ink/75">{children}</div><Link href="/shop" className="button-primary mt-10">Continue shopping</Link></article>;
}
