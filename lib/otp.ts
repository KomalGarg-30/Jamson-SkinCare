import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { emailOtps } from "@/db/schema";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { otpEmail } from "@/lib/email-templates";
import { rateLimitMany } from "@/lib/rate-limit";

export type OtpPurpose = "signup" | "password_reset";
export class OtpError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterSeconds?: number) {
    super(message);
  }
}

const flowCookie = "jamson_otp_flow";
const secret = () => new TextEncoder().encode(getEnv().JWT_SECRET);

function hashOtp(email: string, purpose: OtpPurpose, code: string) {
  return createHmac("sha256", getEnv().JWT_SECRET).update(`${email}:${purpose}:${code}`).digest("hex");
}

export function otpLength() {
  return getEnv().OTP_LENGTH;
}

export async function setOtpFlow(email: string, purpose: OtpPurpose, sentAt = Math.floor(Date.now() / 1000), resendCount = 0) {
  const token = await new SignJWT({ email, purpose, flowSentAt: sentAt, resendCount })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt().setExpirationTime("24h").sign(secret());
  try {
    (await cookies()).set(flowCookie, token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 86400,
    });
  } catch (error) {
    console.error("OTP flow cookie could not be written; continuing with database flow state:", error);
  }
}

export async function requireOtpFlow(email: string, purpose: OtpPurpose) {
  const token = (await cookies()).get(flowCookie)?.value;
  if (!token) {
    const [record] = await db.select({
      lastSentAt: emailOtps.lastSentAt,
      resendCount: emailOtps.resendCount,
    }).from(emailOtps).where(and(
      eq(emailOtps.email, email),
      eq(emailOtps.purpose, purpose),
      isNull(emailOtps.usedAt),
    )).limit(1);
    if (record) {
      return {
        sentAt: Math.floor(record.lastSentAt.getTime() / 1000),
        resendCount: record.resendCount,
      };
    }
  }
  if (!token) throw new OtpError("This verification session has expired. Please start again.", 401);
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.email !== email || payload.purpose !== purpose) {
      throw new OtpError("This verification session does not match the email address.", 403);
    }
    return {
      sentAt: typeof payload.flowSentAt === "number" ? payload.flowSentAt : payload.iat ?? Math.floor(Date.now() / 1000),
      resendCount: typeof payload.resendCount === "number" ? payload.resendCount : 0,
    };
  } catch (error) {
    if (error instanceof OtpError) throw error;
    throw new OtpError("This verification session has expired. Please start again.", 401);
  }
}

export async function clearOtpFlow() {
  (await cookies()).set(flowCookie, "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0,
  });
}

function limitKeys(email: string, ip: string, action: "send" | "verify") {
  const emailKey = createHmac("sha256", getEnv().JWT_SECRET).update(email).digest("hex");
  const ipKey = createHmac("sha256", getEnv().JWT_SECRET).update(ip).digest("hex");
  return [`otp:${action}:email:${emailKey}`, `otp:${action}:ip:${ipKey}`];
}

export async function rateLimitOtp(email: string, ip: string, action: "send" | "verify") {
  const allowed = await rateLimitMany(limitKeys(email, ip, action), action === "send" ? 8 : 12, 15 * 60_000);
  if (!allowed) {
    throw new OtpError(action === "send" ? "Too many code requests. Please try again later." : "Too many verification attempts. Please try again later.", 429);
  }
}

export async function issueOtp(email: string, purpose: OtpPurpose, ip: string) {
  const env = getEnv();
  const [previous] = await db.select().from(emailOtps)
    .where(and(eq(emailOtps.email, email), eq(emailOtps.purpose, purpose))).limit(1);
  const now = new Date();
  if (previous) {
    const secondsSinceLastSend = Math.floor((now.getTime() - previous.lastSentAt.getTime()) / 1000);
    const remaining = env.OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLastSend;
    if (remaining > 0) throw new OtpError(`Please wait ${remaining} seconds before requesting another code.`, 429, remaining);
  }

  const code = String(randomInt(0, 10 ** env.OTP_LENGTH)).padStart(env.OTP_LENGTH, "0");
  const otpHash = hashOtp(email, purpose, code);
  const sameWindow = previous && now.getTime() - previous.resendWindowStart.getTime() < 60 * 60_000;
  const resendWindowStart = sameWindow ? previous.resendWindowStart : now;
  const resendCount = previous ? (sameWindow ? previous.resendCount + 1 : 1) : 0;
  await db.insert(emailOtps).values({
    email, purpose, otpHash, attempts: 0,
    expiresAt: new Date(now.getTime() + env.OTP_EXPIRY_MINUTES * 60_000),
    lastSentAt: now, resendCount, resendWindowStart, ipAddress: ip,
  }).onConflictDoUpdate({
    target: [emailOtps.email, emailOtps.purpose],
    set: {
      otpHash, attempts: 0,
      expiresAt: new Date(now.getTime() + env.OTP_EXPIRY_MINUTES * 60_000),
      lastSentAt: now, resendCount, resendWindowStart, usedAt: null, ipAddress: ip,
    },
  });

  try {
    const content = otpEmail(purpose, code, env.OTP_EXPIRY_MINUTES);
    await sendEmail({ to: email, ...content });
  } catch (error) {
    if (previous) {
      await db.update(emailOtps).set({
        otpHash: previous.otpHash, attempts: previous.attempts, expiresAt: previous.expiresAt,
        lastSentAt: previous.lastSentAt, resendCount: previous.resendCount,
        resendWindowStart: previous.resendWindowStart, usedAt: previous.usedAt, ipAddress: previous.ipAddress,
      }).where(and(eq(emailOtps.email, email), eq(emailOtps.purpose, purpose), eq(emailOtps.otpHash, otpHash)));
    } else {
      await db.delete(emailOtps).where(and(eq(emailOtps.email, email), eq(emailOtps.purpose, purpose), eq(emailOtps.otpHash, otpHash)));
    }
    throw error;
  }

  if (purpose === "signup") {
    try {
      await setOtpFlow(email, purpose, Math.floor(now.getTime() / 1000), resendCount);
    } catch (error) {
      console.error("OTP flow cookie could not be written; using database fallback:", error);
    }
  }
  return { lastSentAt: now, cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS };
}

export async function otpStatus(email: string, purpose: OtpPurpose, flow: { sentAt: number; resendCount: number }) {
  const env = getEnv();
  if (purpose === "password_reset") {
    const lastSentAt = new Date(flow.sentAt * 1000);
    return {
      lastSentAt: lastSentAt.toISOString(),
      remainingSeconds: Math.max(0, env.OTP_RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - lastSentAt.getTime()) / 1000)),
      otpLength: env.OTP_LENGTH,
    };
  }
  const [record] = await db.select({
    lastSentAt: emailOtps.lastSentAt,
    resendCount: emailOtps.resendCount,
    resendWindowStart: emailOtps.resendWindowStart,
  }).from(emailOtps).where(and(eq(emailOtps.email, email), eq(emailOtps.purpose, purpose))).limit(1);
  if (!record) {
    const lastSentAt = new Date(flow.sentAt * 1000);
    return {
      lastSentAt: lastSentAt.toISOString(),
      remainingSeconds: Math.max(0, env.OTP_RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - lastSentAt.getTime()) / 1000)),
      otpLength: env.OTP_LENGTH,
    };
  }
  const remainingSeconds = Math.max(0, env.OTP_RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - record.lastSentAt.getTime()) / 1000));
  return {
    lastSentAt: record.lastSentAt.toISOString(),
    remainingSeconds,
    otpLength: env.OTP_LENGTH,
  };
}

export async function verifyOtp(email: string, purpose: OtpPurpose, code: string, ip: string) {
  await rateLimitOtp(email, ip, "verify");
  const [record] = await db.select().from(emailOtps).where(and(
    eq(emailOtps.email, email), eq(emailOtps.purpose, purpose), isNull(emailOtps.usedAt),
  )).limit(1);
  if (!record) throw new OtpError("This code is invalid or has expired. Request a new code and try again.", 400);
  if (record.expiresAt.getTime() <= Date.now()) {
    throw new OtpError("This code has expired. Request a new code to continue.", 400);
  }
  const expected = Buffer.from(record.otpHash, "hex");
  const actual = Buffer.from(hashOtp(email, purpose, code), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new OtpError("That code isn't correct. Please try again or request a new code.", 400);
  }
  return record;
}
