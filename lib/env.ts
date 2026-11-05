import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid Neon pooled connection URL."),
  DATABASE_URL_UNPOOLED: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters. Generate a secure random value."),
  CRON_SECRET: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()),
  NEXT_PUBLIC_APP_URL: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
  VERCEL_URL: z.string().optional(),
  STORE_NAME: z.string().default("Jamson Wellness").transform((value) => value.trim() || "Jamson Wellness"),
  CURRENCY: z.string().default("INR").transform((value) => value.trim().toUpperCase() || "INR"),
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
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.preprocess((value) => value === "" || value === undefined ? 587 : value, z.coerce.number().int().min(1).max(65535)),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  RETURN_WINDOW_DAYS: z.preprocess((value) => value === "" || value === undefined ? 7 : value, z.coerce.number().int().min(1).max(365)),
  AUDIT_LOG_RETENTION_DAYS: z.preprocess((value) => value === "" || value === undefined ? undefined : value, z.coerce.number().int().min(30).max(3650).optional()),
});

function deploymentIssues(data: z.infer<typeof schema>) {
  const missing: string[] = [];
  if (!data.NEXT_PUBLIC_APP_URL && !data.VERCEL_URL) missing.push("NEXT_PUBLIC_APP_URL (or VERCEL_URL)");
  if (process.env.VERCEL === "1" || process.env.DEPLOYMENT_ENV_CHECK === "1") {
    if (!data.DATABASE_URL_UNPOOLED) missing.push("DATABASE_URL_UNPOOLED");
    if (!data.CRON_SECRET) missing.push("CRON_SECRET");
    if (!data.IMAGEKIT_PUBLIC_KEY) missing.push("IMAGEKIT_PUBLIC_KEY");
    if (!data.IMAGEKIT_PRIVATE_KEY) missing.push("IMAGEKIT_PRIVATE_KEY");
    if (!data.IMAGEKIT_URL_ENDPOINT) missing.push("IMAGEKIT_URL_ENDPOINT");
    if (!data.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY) missing.push("NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY");
    if (!data.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT) missing.push("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT");
    if (!data.RAZORPAY_KEY_ID) missing.push("RAZORPAY_KEY_ID");
    if (!data.RAZORPAY_KEY_SECRET) missing.push("RAZORPAY_KEY_SECRET");
    if (!data.NEXT_PUBLIC_RAZORPAY_KEY_ID) missing.push("NEXT_PUBLIC_RAZORPAY_KEY_ID");
    if (!data.RAZORPAY_WEBHOOK_SECRET) missing.push("RAZORPAY_WEBHOOK_SECRET");
    for (const key of ["EMAIL_HOST", "EMAIL_USER", "EMAIL_PASSWORD", "EMAIL_FROM"] as const) {
      if (!data[key]) missing.push(key);
    }

    const pooledHost = new URL(data.DATABASE_URL).hostname;
    if (!pooledHost.includes("-pooler")) missing.push("DATABASE_URL (must be the Neon pooled connection string containing -pooler)");
    if (data.DATABASE_URL_UNPOOLED && new URL(data.DATABASE_URL_UNPOOLED).hostname.includes("-pooler")) {
      missing.push("DATABASE_URL_UNPOOLED (must be the Neon direct, non-pooled connection string)");
    }
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

export function getAppUrl() {
  const env = getEnv();
  const baseUrl = env.NEXT_PUBLIC_APP_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "");
  if (!baseUrl) throw new Error("NEXT_PUBLIC_APP_URL or VERCEL_URL is required to build absolute links.");
  return baseUrl.replace(/\/+$/, "");
}
