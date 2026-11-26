import { describe, expect, it } from "vitest";
import { authEnvSchema, databaseUrlSchema } from "../../src/lib/env";

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
      BETTER_AUTH_SECRET: "pendek",
      BETTER_AUTH_URL: "http://localhost:3000",
    }).success).toBe(false);
  });

  it("menerima URL localhost untuk auth lokal", () => {
    expect(authEnvSchema.safeParse({
      BETTER_AUTH_SECRET: "a".repeat(32),
      BETTER_AUTH_URL: "http://localhost:3000",
    }).success).toBe(true);
  });
});
