import { NextResponse } from "next/server";
import { ZodError } from "zod";

function databaseErrorDetails(error: unknown) {
  const visited = new Set<object>();
  let current = error;
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    const record = current as Record<string, unknown>;
    if (typeof record.code === "string") {
      return {
        code: record.code,
        constraint: typeof record.constraint === "string" ? record.constraint : null,
      };
    }
    current = record.cause;
  }
  return null;
}

export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  const databaseError = databaseErrorDetails(error);
  if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  if (message === "FORBIDDEN") return NextResponse.json({ error: "You do not have permission to do that." }, { status: 403 });
  if (message.startsWith("Store configuration is incomplete") || message.includes(" is required for this feature.") ||
      message.startsWith("DATABASE_URL is required.")) {
    return NextResponse.json({ error: message }, { status: 503 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message || "Please check the information you entered." }, { status: 400 });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }
  if (message.startsWith("Not enough stock remains") || message.startsWith("That coupon has reached its usage limit") ||
      message.startsWith("Only pending or confirmed orders can be cancelled")) {
    return NextResponse.json({ error: message }, { status: 409 });
  }
  if (databaseError?.code === "23505") {
    if (databaseError.constraint === "products_sku_unique") {
      return NextResponse.json({ error: "That SKU is already in use. Choose a unique SKU." }, { status: 409 });
    }
    if (databaseError.constraint === "products_slug_unique") {
      return NextResponse.json({ error: "That product slug is already in use. Choose a unique slug." }, { status: 409 });
    }
    return NextResponse.json({ error: "A record with these details already exists. Check unique fields and try again." }, { status: 409 });
  }
  if (databaseError?.code === "23503") {
    return NextResponse.json({ error: "That change conflicts with existing store data. Check related records and try again." }, { status: 409 });
  }
  if (databaseError?.code === "23514") {
    return NextResponse.json({ error: "The submitted values do not meet the store's data requirements." }, { status: 400 });
  }
  console.error("API request failed:", error);
  return NextResponse.json({ error: "Something went wrong while processing your request. Please try again." }, { status: 500 });
}
