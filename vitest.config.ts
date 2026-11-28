import { randomBytes } from "node:crypto";
import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(__dirname, "migrations")),
          BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
          TWITCH_CLIENT_ID: "x", TWITCH_CLIENT_SECRET: "x", GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "x",
          ADMINS: "190835130",
        },
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"], setupFiles: ["./test/helpers/setup.ts"] },
}));
