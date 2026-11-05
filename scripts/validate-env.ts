import { loadEnvConfig } from "@next/env";
import { getEnv } from "@/lib/env";

loadEnvConfig(process.cwd());
process.env.DEPLOYMENT_ENV_CHECK = "1";
getEnv();
console.log("Production environment validation passed.");
