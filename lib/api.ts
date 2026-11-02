import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  const databaseCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code : null;
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
  if (databaseCode === "23505" || databaseCode === "23503") {
    return NextResponse.json({ error: "That change conflicts with existing store data. Check related records and try again." }, { status: 409 });
  }
  if (databaseCode === "23514") {
    return NextResponse.json({ error: "The submitted values do not meet the store's data requirements." }, { status: 400 });
  }
  console.error("API request failed:", error);
  return NextResponse.json({ error: "Something went wrong while processing your request. Please try again." }, { status: 500 });
}
