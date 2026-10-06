import { describe, expect, it } from "vitest";
import { envSchema } from "@/env";

const validEnv = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/clubday",
  BETTER_AUTH_SECRET: "secret",
  APP_URL: "http://localhost:3000",
  CHECKIN_SECRET: "secret",
  CERT_SECRET: "secret",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  JOBS_TOKEN: "jobs-token",
};

describe("envSchema", () => {
  it("accepts required ClubDay environment variables", () => {
    expect(envSchema.parse(validEnv)).toEqual(validEnv);
  });

  it("rejects missing values", () => {
    expect(() => envSchema.parse({})).toThrow();
  });
});
