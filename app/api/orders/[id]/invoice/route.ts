import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { orderItems, orders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { db } from "@/lib/db";
import { z } from "zod";

function pdfString(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/[\\()]/g, "\\$&");
}

function makePdf(lines: string[]) {
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / 45)) }, (_, index) => lines.slice(index * 45, (index + 1) * 45));
  const fontId = 3 + pages.length * 2;
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  pages.forEach((pageLines, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    const stream = pageLines.map((line, lineIndex) =>
      `BT /F1 ${lineIndex === 0 && index === 0 ? 18 : 10} Tf 48 ${750 - lineIndex * 16} Td (${pdfString(line.slice(0, 100))}) Tj ET`,
    ).join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`;
  });
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(document, "ascii");
    document += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document, "ascii");
  document += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) document += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  document += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(document, "ascii");
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const parsedId = z.uuid().safeParse(id);
    if (!parsedId.success) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
    const [order] = await db.select().from(orders)
      .where(and(eq(orders.id, parsedId.data), eq(orders.userId, user.id))).limit(1);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, parsedId.data));
    const address = typeof order.shippingAddress === "object" && order.shippingAddress !== null
      ? order.shippingAddress as Record<string, unknown> : {};
    const lines = [
      "Decotrin - Invoice",
      `Order: ${order.id}`,
      `Date: ${order.createdAt.toISOString().slice(0, 10)}    Status: ${order.status}    Payment: ${order.paymentStatus}`,
      `Payment method: ${order.paymentMethod}`,
      "",
      "Items:",
      ...items.map((item) => `${item.productName} x ${item.quantity} @ Rs ${(item.unitPrice / 100).toFixed(2)} = Rs ${(item.unitPrice * item.quantity / 100).toFixed(2)}`),
      "",
      `Subtotal: Rs ${(order.subtotal / 100).toFixed(2)}`,
      `Shipping: Rs ${(order.shipping / 100).toFixed(2)}`,
      `Tax: Rs ${(order.tax / 100).toFixed(2)}`,
      `Discount: Rs ${(order.discount / 100).toFixed(2)}`,
      `Total: Rs ${(order.total / 100).toFixed(2)}`,
      "",
      "Delivery address:",
      ...["name", "phone", "line1", "line2", "city", "state", "pincode", "country"]
        .map((key) => address[key]).filter((value): value is string => typeof value === "string" && value.length > 0),
    ];
    const pdf = makePdf(lines);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="decotrin-invoice-${id.slice(0, 8)}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
