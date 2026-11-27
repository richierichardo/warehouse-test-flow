import { describe, expect, it } from "vitest";
import { authEnvSchema, databaseUrlSchema } from "../../src/lib/env";

const localAuth = {
  NODE_ENV: "test",
  BETTER_AUTH_SECRET: "a".repeat(32),
  RATE_LIMIT_KEY_SECRET: "b".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  APP_ORIGIN: "http://localhost:3000",
};

describe("Konfigurasi server", () => {
  it("menerima URL PostgreSQL langsung", () => {
    expect(databaseUrlSchema.safeParse("postgresql://warehouse@127.0.0.1:5433/warehouse").success).toBe(true);
  });

  it("menolak URL database yang salah atau hilang", () => {
    expect(databaseUrlSchema.safeParse("https://example.test/warehouse").success).toBe(false);
    expect(databaseUrlSchema.safeParse(undefined).success).toBe(false);
  });

  it("menolak secret auth yang terlalu pendek", () => {
    expect(authEnvSchema.safeParse({
      ...localAuth,
      BETTER_AUTH_SECRET: "pendek",
    }).success).toBe(false);
  });

  it("menerima URL localhost untuk auth lokal", () => {
    expect(authEnvSchema.safeParse(localAuth).success).toBe(true);
  });

  it.each([
    { NODE_ENV: "production" },
    { APP_ORIGIN: "http://127.0.0.1:3000" },
    { APP_ORIGIN: "http://warehouse.example", BETTER_AUTH_URL: "http://warehouse.example" },
    { APP_ORIGIN: "http://localhost:3000/path" },
    { APP_ORIGIN: "bukan-url" },
    { TRUSTED_PROXY_MODE: "nginx" },
  ])("menolak origin atau proxy yang tidak sah (%j)", (override) => {
    expect(authEnvSchema.safeParse({ ...localAuth, ...override }).success).toBe(false);
  });
});
