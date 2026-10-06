import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  APP_URL: z.string().url(),
  CHECKIN_SECRET: z.string().min(1),
  CERT_SECRET: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  JOBS_TOKEN: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

function readEnv(): Env {
  cached ??= envSchema.parse(process.env);
  return cached;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, property) {
    if (typeof property !== "string" || property === "then") {
      return undefined;
    }
    return readEnv()[property as keyof Env];
  },
});
