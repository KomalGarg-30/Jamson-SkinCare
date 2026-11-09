import { POST as createOrder } from "@/app/api/checkout/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createOrder;
