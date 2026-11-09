import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid Neon pooled connection URL."),
  DATABASE_URL_UNPOOLED: z.preprocess((value) => value === "" ? undefined : value, z.string().url("DATABASE_URL_UNPOOLED must be a valid Neon direct connection URL.").optional()),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters. Generate a secure random value."),
  CRON_SECRET: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()),
  NEXT_PUBLIC_APP_URL: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
  VERCEL_URL: z.string().optional(),
  STORE_NAME: z.string().default("Decotrin").transform((value) => value.trim() || "Decotrin"),
  CURRENCY: z.string().default("INR").transform((value) => value.trim().toUpperCase() || "INR").refine((value) => value === "INR", "Only INR is supported by Razorpay checkout."),
  IMAGEKIT_PUBLIC_KEY: z.string().optional(),
  IMAGEKIT_PRIVATE_KEY: z.string().optional(),
  IMAGEKIT_URL_ENDPOINT: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
  NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY: z.string().optional(),
  NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
  IMAGEKIT_UPLOAD_FOLDER: z.preprocess((value) => value === "" ? undefined : value, z.string().default("/skincare-store/products")),
  MAX_IMAGE_SIZE_MB: z.preprocess((value) => value === "" || value === undefined ? 5 : value, z.coerce.number().int().min(1).max(25)),
  MAX_IMAGES_PER_PRODUCT: z.preprocess((value) => value === "" || value === undefined ? 8 : value, z.coerce.number().int().min(1).max(20)),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_MODE: z.enum(["test", "live"]).default("test"),
  PAYMENT_PENDING_EXPIRY_MINUTES: z.preprocess((value) => value === "" || value === undefined ? 15 : value, z.coerce.number().int().min(1).max(1440)),
  COD_ENABLED: z.preprocess((value) => value === "" || value === undefined ? false : value === true || value === "true", z.boolean()),
  COD_MAX_ORDER_AMOUNT: z.preprocess((value) => value === "" || value === undefined ? 0 : value, z.coerce.number().int().nonnegative()),
  COD_EXTRA_CHARGE: z.preprocess((value) => value === "" || value === undefined ? 0 : value, z.coerce.number().int().nonnegative()),
  RESEND_API_KEY: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().optional()),
  EMAIL_FROM: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().min(1, "EMAIL_FROM is required to send email.").optional()),
  EMAIL_REPLY_TO: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().email("EMAIL_REPLY_TO must be a valid support email.").optional()),
  GOOGLE_CLIENT_ID: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().optional()),
  OTP_LENGTH: z.preprocess((value) => value === "" || value === undefined ? 6 : value, z.coerce.number().int().min(4).max(8)),
  OTP_EXPIRY_MINUTES: z.preprocess((value) => value === "" || value === undefined ? 1 : value, z.coerce.number().int().min(1).max(60)),
  OTP_RESEND_COOLDOWN_SECONDS: z.preprocess((value) => value === "" || value === undefined ? 60 : value, z.coerce.number().int().min(1).max(3600)),
  UPSTASH_REDIS_REST_URL: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
  UPSTASH_REDIS_REST_TOKEN: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()),
  RETURN_WINDOW_DAYS: z.preprocess((value) => value === "" || value === undefined ? 7 : value, z.coerce.number().int().min(1).max(365)),
  AUDIT_LOG_RETENTION_DAYS: z.preprocess((value) => value === "" || value === undefined ? undefined : value, z.coerce.number().int().min(30).max(3650).optional()),
});

function deploymentIssues(data: z.infer<typeof schema>) {
  const missing: string[] = [];
  const paymentConfigured = Boolean(data.RAZORPAY_KEY_ID || data.RAZORPAY_KEY_SECRET || data.NEXT_PUBLIC_RAZORPAY_KEY_ID || data.RAZORPAY_WEBHOOK_SECRET);
  if (paymentConfigured) {
    if (!data.RAZORPAY_KEY_ID) missing.push("RAZORPAY_KEY_ID");
    if (!data.RAZORPAY_KEY_SECRET) missing.push("RAZORPAY_KEY_SECRET");
    if (!data.NEXT_PUBLIC_RAZORPAY_KEY_ID) missing.push("NEXT_PUBLIC_RAZORPAY_KEY_ID");
    if (!data.RAZORPAY_WEBHOOK_SECRET) missing.push("RAZORPAY_WEBHOOK_SECRET");
    const expectedPrefix = data.RAZORPAY_MODE === "live" ? "rzp_live_" : "rzp_test_";
    if (data.RAZORPAY_KEY_ID && !data.RAZORPAY_KEY_ID.startsWith(expectedPrefix)) missing.push(`RAZORPAY_KEY_ID (must start with ${expectedPrefix})`);
    if (data.NEXT_PUBLIC_RAZORPAY_KEY_ID && !data.NEXT_PUBLIC_RAZORPAY_KEY_ID.startsWith(expectedPrefix)) missing.push(`NEXT_PUBLIC_RAZORPAY_KEY_ID (must start with ${expectedPrefix})`);
    if (data.RAZORPAY_MODE === "live" && process.env.NODE_ENV !== "production") missing.push("RAZORPAY_MODE=live is allowed only in production");
  }
  if (!data.NEXT_PUBLIC_APP_URL && !data.VERCEL_URL) missing.push("NEXT_PUBLIC_APP_URL (or VERCEL_URL)");
  if (process.env.VERCEL === "1" || process.env.DEPLOYMENT_ENV_CHECK === "1") {
    const pooledHost = new URL(data.DATABASE_URL).hostname;
    if (!pooledHost.includes("-pooler")) missing.push("DATABASE_URL (must be the Neon pooled connection string containing -pooler)");
    if (data.DATABASE_URL_UNPOOLED && new URL(data.DATABASE_URL_UNPOOLED).hostname.includes("-pooler")) {
      missing.push("DATABASE_URL_UNPOOLED (must be the Neon direct, non-pooled connection string)");
    }
    if (!data.RESEND_API_KEY) missing.push("RESEND_API_KEY (create one in Resend)");
    if (!data.EMAIL_FROM) missing.push("EMAIL_FROM (use a verified Resend sender)");
  }
  return missing;
}

export function getEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join(" ");
    throw new Error(`Store configuration is incomplete: ${details}`);
  }
  const missing = deploymentIssues(parsed.data);
  if (missing.length) {
    throw new Error(`Store configuration is incomplete. Missing or invalid production variables: ${missing.join(", ")}.`);
  }
  return parsed.data;
}

export function getSetupError() {
  try {
    getEnv();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Store configuration is incomplete.";
  }
}

export function requireEnv<K extends keyof ReturnType<typeof getEnv>>(key: K): NonNullable<ReturnType<typeof getEnv>[K]> {
  const value = getEnv()[key];
  if (!value) {
    throw new Error(`${String(key)} is required for this feature. Add it to .env and restart the app.`);
  }
  return value as NonNullable<ReturnType<typeof getEnv>[K]>;
}

export function getEmailConfig() {
  const env = getEnv();
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey) {
    throw new Error("Email is not configured. Add RESEND_API_KEY from your Resend dashboard to .env and restart the app.");
  }
  if (!from) {
    throw new Error("Email is not configured. Add EMAIL_FROM using a sender address verified in Resend to .env and restart the app.");
  }
  return { ...env, RESEND_API_KEY: apiKey, EMAIL_FROM: from };
}

export function getAppUrl() {
  const env = getEnv();
  const baseUrl = env.NEXT_PUBLIC_APP_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "");
  if (!baseUrl) throw new Error("NEXT_PUBLIC_APP_URL or VERCEL_URL is required to build absolute links.");
  return baseUrl.replace(/\/+$/, "");
}
