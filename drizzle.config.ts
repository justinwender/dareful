import { config } from "dotenv";

config({ path: ".env.local" });
config();
import { defineConfig } from "drizzle-kit";

// DDL tooling wants a session, so it uses the session string. `drizzle-kit generate` never connects;
// this matters only for `db:studio`.
const url = process.env.DATABASE_URL_SESSION ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_SESSION is not set (put it in .env.local and load it, or export it)");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
