import Link from "next/link";
import { BarChart3, Boxes, ClipboardList, FolderTree, Image, MessageSquare, Settings, Users, TicketPercent, RotateCcw } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";

const links = [
  ["Overview", "/admin", BarChart3], ["Products", "/admin/products", Boxes],
  ["Categories", "/admin/categories", FolderTree], ["Orders", "/admin/orders", ClipboardList],
  ["Customers", "/admin/customers", Users], ["Users", "/admin/users", Users],
  ["Returns", "/admin/returns", RotateCcw], ["Payments", "/admin/payments", ClipboardList], ["Reviews", "/admin/reviews", MessageSquare],
  ["Coupons", "/admin/coupons", TicketPercent], ["Banners", "/admin/banners", Image],
  ["Settings", "/admin/settings", Settings],
] as const;

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireAdminPage();
  return <div className="container-page grid gap-8 py-8 lg:grid-cols-[230px_1fr]">
    <aside className="self-start rounded-2xl bg-white p-4 lg:sticky lg:top-24"><p className="px-3 pb-3 font-serif text-xl">Store admin</p><nav className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">{links.map(([label, href, Icon]) => <Link key={href} href={href} className="admin-nav-link"><Icon size={17} />{label}</Link>)}</nav></aside>
    <div className="min-w-0">{children}</div>
  </div>;
}
