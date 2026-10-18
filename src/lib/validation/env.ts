import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection string"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("3000"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  
  // Security
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters long"),
  SESSION_MAX_AGE_SECONDS: z.coerce.number().default(28800), // 8 hours
  ADMIN_BOOTSTRAP_SECRET: z.string().min(16, "ADMIN_BOOTSTRAP_SECRET must be at least 16 characters long"),

  // Microsoft Entra ID
  ENTRA_TENANT_ID: z.string().min(1, "ENTRA_TENANT_ID is required"),
  ENTRA_CLIENT_ID: z.string().min(1, "ENTRA_CLIENT_ID is required"),
  ENTRA_CLIENT_SECRET: z.string().min(1, "ENTRA_CLIENT_SECRET is required"),
  ENTRA_REDIRECT_URI: z.string().url().default("http://localhost:3000/api/v1/auth/callback"),
  ENTRA_SCOPES: z.string().default("openid,profile,email,User.Read"),

  // Storage
  STORAGE_PROVIDER: z.enum(["local", "sharepoint"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./storage"),
  SHAREPOINT_SITE_ID: z.string().optional(),
  SHAREPOINT_DRIVE_ID: z.string().optional(),
  SHAREPOINT_ROOT_FOLDER: z.string().default("NUTM-Learn-Materials"),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type EnvConfig = z.infer<typeof envSchema>;

let parsedEnv: EnvConfig;

export function getEnv(): EnvConfig {
  if (parsedEnv) return parsedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:", JSON.stringify(result.error.format(), null, 2));
    throw new Error("Invalid application environment configuration. Please check your .env configuration.");
  }

  parsedEnv = result.data;
  return parsedEnv;
}
