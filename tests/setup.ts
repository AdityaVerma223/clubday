import { config } from "dotenv";

// Load environment variables from .env file
config({ path: ".env" });

// The membership integration tests clear their tables before each test. Require
// an explicitly named test database so a developer's normal .env database can
// never be wiped accidentally.
const testDatabaseUrl = process.env.CLUBDAY_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    "CLUBDAY_TEST_DATABASE_URL is required. Point it at a disposable database ending in _test.",
  );
}

const testDatabaseName = new URL(testDatabaseUrl).pathname.slice(1);
if (!/(?:^|[_-])test$/i.test(testDatabaseName)) {
  throw new Error(
    "CLUBDAY_TEST_DATABASE_URL must point to a disposable database whose name ends in _test.",
  );
}

// Force all application DB access during tests onto the isolated test database.
process.env.DATABASE_URL = testDatabaseUrl;

// The env schema validates all application settings when the DB module loads.
process.env.BETTER_AUTH_SECRET ??= "test-only-better-auth-secret-at-least-32-chars";
process.env.APP_URL ??= "http://localhost:3000";
process.env.CHECKIN_SECRET ??= "test-only-checkin-secret";
process.env.CERT_SECRET ??= "test-only-cert-secret";
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only-supabase-key";
process.env.JOBS_TOKEN ??= "test-only-jobs-token";
