import { getEnv } from "@/lib/env";

export function register() {
  if (process.env.VERCEL === "1") getEnv();
}
