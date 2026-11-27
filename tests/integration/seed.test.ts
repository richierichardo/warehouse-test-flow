import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { verifyPassword } from "better-auth/crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createDb } from "../../src/lib/db";
import { testDatabaseUrl } from "./database";

vi.mock("server-only", () => ({}));

const execFileAsync = promisify(execFile);
const tag = randomUUID();
const employeeEmail = `employee.${tag}@example.test`;
const warehouseEmail = `warehouse.${tag}@example.test`;
const adminEmail = `admin.${tag}@example.test`;
const emails = [employeeEmail, warehouseEmail, adminEmail];
const password = ` ${randomBytes(24).toString("hex")} `;

let db: ReturnType<typeof createDb>;
let databaseUrl: string;

beforeAll(() => {
  databaseUrl = testDatabaseUrl();
  db = createDb(databaseUrl);
});

afterAll(async () => {
  if (db) {
    try {
      await db.user.deleteMany({ where: { email: { in: emails } } });
    } finally {
      await db.$disconnect();
    }
  }
});

function runSeed(overrides: Record<string, string> = {}) {
  return execFileAsync(process.execPath, ["--conditions=react-server", "prisma/seed.ts"], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      SEED_DEMO_ENABLED: "true",
      SEED_EMPLOYEE_EMAIL: ` ${employeeEmail.toUpperCase()} `,
      SEED_EMPLOYEE_PASSWORD: password,
      SEED_WAREHOUSE_EMAIL: warehouseEmail,
      SEED_WAREHOUSE_PASSWORD: password,
      SEED_SUPERADMIN_EMAIL: adminEmail,
      SEED_SUPERADMIN_PASSWORD: password,
      ...overrides,
    },
    timeout: 15_000,
    windowsHide: true,
  });
}

function demoUsers() {
  return db.user.findMany({
    where: { email: { in: emails } },
    orderBy: { email: "asc" },
    include: { accounts: true },
  });
}

function stockCounts() {
  return db.$transaction([
    db.item.count(), db.goodsReceipt.count(), db.itemRequest.count(), db.stockMovement.count(),
  ]);
}

it("melewati seed tanpa opt-in dan menolak konfigurasi tidak lengkap tanpa menulis akun", async () => {
  const disabled = await runSeed({ SEED_DEMO_ENABLED: "false" });
  expect(disabled.stdout).toContain("Seed demo dilewati");

  await expect(runSeed({ SEED_SUPERADMIN_PASSWORD: "" })).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining("ketiga role demo"),
  });
  await expect(runSeed({ SEED_SUPERADMIN_EMAIL: employeeEmail })).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining("email yang berbeda"),
  });

  expect(await demoUsers()).toHaveLength(0);
}, 20_000);

it("membuat tiga akun credential dan mempertahankan akun yang ada saat seed diulang", async () => {
  const initialStock = await stockCounts();
  const first = await runSeed();
  expect(first.stdout).toContain("3 akun dibuat dan 0 akun dilewati");
  expect(first.stdout).not.toContain(password.trim());

  const users = await demoUsers();
  expect(users.map(({ email, role }) => ({ email, role }))).toEqual([
    { email: adminEmail, role: "SUPERADMIN" },
    { email: employeeEmail, role: "EMPLOYEE" },
    { email: warehouseEmail, role: "WAREHOUSE" },
  ]);

  for (const user of users) {
    expect(user.is_active).toBe(true);
    expect(user.accounts).toHaveLength(1);
    const account = user.accounts[0];
    expect(account).toMatchObject({ accountId: user.id, userId: user.id, providerId: "credential" });
    if (!account.password) throw new Error("Credential demo belum mempunyai hash.");
    expect(account.password).not.toBe(password);
    expect(await verifyPassword({ hash: account.password, password })).toBe(true);
  }

  await db.user.update({ where: { email: employeeEmail }, data: { role: "WAREHOUSE", is_active: false } });
  const beforeRepeat = await demoUsers();
  const repeat = await runSeed({ SEED_EMPLOYEE_PASSWORD: randomBytes(24).toString("hex") });
  expect(repeat.stdout).toContain("0 akun dibuat dan 3 akun dilewati");
  expect(await demoUsers()).toEqual(beforeRepeat);
  expect(await stockCounts()).toEqual(initialStock);
}, 25_000);
