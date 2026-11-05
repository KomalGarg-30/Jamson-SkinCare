import { loadEnvConfig } from "@next/env";
import { getEnv } from "@/lib/env";

loadEnvConfig(process.cwd());
process.env.DEPLOYMENT_ENV_CHECK = "1";
getEnv();
console.log("Core and configured environment validation passed.");
