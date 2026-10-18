import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/env";

export const auth = betterAuth({
      trustedOrigins: [
  env.APP_URL,
  "https://clubday-nine.vercel.app",
  "https://clubday-*-anarchy9.vercel.app",
  "https://clubday-670c5jvrg-anarchy9.vercel.app",
  "https://clubday-git-feat-day-3-clubs-anarchy9.vercel.app",
  "https://clubday-j99nq74ua-anarchy9.vercel.app",
  "https://clubday-znviteunc-anarchy9.vercel.app",
  "https://clubday-ji2mz3h0d-anarchy9.vercel.app",
  "https://clubday-i4x7g9zi7-anarchy9.vercel.app",
],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "student",
        input: false,
      },
      campusId: {
        type: "string",
        required: false,
        input: false,
      },
      studentId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.APP_URL,
});
