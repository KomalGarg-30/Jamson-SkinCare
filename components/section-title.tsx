import Link from "next/link";

export function SectionTitle({ eyebrow, title, description, href, linkLabel }: {
  eyebrow?: string; title: string; description?: string; href?: string; linkLabel?: string;
}) {
  return <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
    <div>{eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-sage-dark">{eyebrow}</p>}
      <h2 className="font-serif text-3xl text-ink md:text-4xl">{title}</h2>
      {description && <p className="mt-3 max-w-xl text-sm leading-6 text-ink/65">{description}</p>}
    </div>
    {href && <Link href={href} className="text-sm font-medium text-sage-dark underline decoration-sage/40 underline-offset-4">{linkLabel || "Shop all"}</Link>}
  </div>;
}
