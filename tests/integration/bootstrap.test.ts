import "dotenv/config";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createDb } from "../../src/lib/db";
import { createWarehouseAuth } from "../../src/lib/auth";

vi.mock("server-only", () => ({}));

let db: ReturnType<typeof createDb> | undefined;

beforeAll(() => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || url === process.env.DATABASE_URL) {
    throw new Error("Set TEST_DATABASE_URL ke database khusus tes yang terpisah.");
  }

  db = createDb(url);
});

afterAll(async () => {
  await db?.$disconnect();
  vi.unstubAllEnvs();
});

it("menghubungkan Prisma ke PostgreSQL 17", async () => {
  if (!db) throw new Error("Prisma belum terhubung ke database tes.");

  const rows = await db.$queryRaw<Array<{ version: number }>>`
    SELECT current_setting('server_version_num')::int AS version
  `;

  expect(rows[0]?.version).toBeGreaterThanOrEqual(170000);
  expect(rows[0]?.version).toBeLessThan(180000);
});

it("memulai Better Auth dengan adapter Prisma", async () => {
  if (!db) throw new Error("Prisma belum terhubung ke database tes.");

  vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  const context = await createWarehouseAuth(db).$context;

  expect(context.adapter.id.toLowerCase()).toContain("prisma");
});
