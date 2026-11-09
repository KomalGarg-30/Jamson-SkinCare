import { NextResponse } from "next/server";
import { z } from "zod";
import { otpStatus, OtpError, requireOtpFlow, type OtpPurpose } from "@/lib/otp";
import { errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const data = z.object({
      email: z.email().transform((value) => value.trim().toLowerCase()),
      purpose: z.enum(["signup", "password_reset"]),
    }).parse({ email: params.get("email"), purpose: params.get("purpose") });
    const flow = await requireOtpFlow(data.email, data.purpose as OtpPurpose);
    return NextResponse.json(await otpStatus(data.email, data.purpose, flow), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof OtpError) return NextResponse.json({ error: error.message }, { status: error.status });
    return errorResponse(error);
  }
}
