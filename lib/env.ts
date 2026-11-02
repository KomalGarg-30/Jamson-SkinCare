import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required. Add your Neon connection string to .env."),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters. Generate a secure random value."),
  NEXT_PUBLIC_APP_URL: z.string().url("NEXT_PUBLIC_APP_URL must be a valid URL."),
  STORE_NAME: z.string().default("Jamson Wellness").transform((value) => value.trim() || "Jamson Wellness"),
  CURRENCY: z.string().default("INR").transform((value) => value.trim().toUpperCase() || "INR"),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.preprocess((value) => value === "" || value === undefined ? 587 : value, z.coerce.number().int().min(1).max(65535)),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

export function getEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join(" ");
    throw new Error(`Store configuration is incomplete: ${details}`);
  }
  return parsed.data;
}

export function getSetupError() {
  const parsed = schema.safeParse(process.env);
  return parsed.success ? null : parsed.error.issues.map((issue) => issue.message).join(" ");
}

export function requireEnv<K extends keyof ReturnType<typeof getEnv>>(key: K): NonNullable<ReturnType<typeof getEnv>[K]> {
  const value = getEnv()[key];
  if (!value) {
    throw new Error(`${String(key)} is required for this feature. Add it to .env and restart the app.`);
  }
  return value as NonNullable<ReturnType<typeof getEnv>[K]>;
}
