import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { userRoles } from "../src/lib/auth-options.ts";
import { createDb } from "../src/lib/db.ts";
import { receiveGoodsSchema } from "../src/modules/receiving/schema.ts";
import { receiveGoods } from "../src/modules/receiving/service.ts";

const accountNames = {
  EMPLOYEE: "Karyawan Demo",
  WAREHOUSE: "Petugas Gudang Demo",
  SUPERADMIN: "Administrator Demo",
};

const seedAccountSchema = z.object({
  role: z.enum(userRoles),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(128),
});

async function seedReceipt(db: ReturnType<typeof createDb>, email: string) {
  const warehouse = await db.user.findUnique({ where: { email }, select: { id: true, role: true, is_active: true } });
  if (!warehouse?.is_active || warehouse.role !== "WAREHOUSE") {
    console.log("Penerimaan demo dilewati karena akun petugas demo tidak aktif atau memiliki role lain.");
    return;
  }

  const code = `DEMO-A4-${createHash("sha256").update(warehouse.id).digest("hex").slice(0, 20).toUpperCase()}`;
  await db.item.createMany({ data: { code, name: "Kertas A4 Demo", unit: "RIM", location: "Rak Demo", createdById: warehouse.id }, skipDuplicates: true });
  const item = await db.item.findUniqueOrThrow({ where: { code }, select: { id: true, createdById: true } });
  if (item.createdById !== warehouse.id) throw new Error("Kode barang demo sudah digunakan akun lain.");

  const input = receiveGoodsSchema.parse({ itemId: item.id, quantity: 25, receivedOn: "2026-11-26", sourceName: "Penerimaan Demo" });
  const result = await receiveGoods(db, { id: warehouse.id, role: warehouse.role }, "16f06a72-18ba-4967-96c8-8b62941e12fd", input);
  console.log(result.status === 201 ? "Penerimaan demo menambahkan 25 RIM." : "Penerimaan demo sudah tercatat.");
}

async function seed() {
  if (process.env.SEED_DEMO_ENABLED !== "true") {
    console.log("Seed demo dilewati. Set SEED_DEMO_ENABLED=true untuk mengaktifkannya.");
    return;
  }

  const parsed = z.array(seedAccountSchema).safeParse(userRoles.map((role) => ({
    role,
    email: process.env[`SEED_${role}_EMAIL`],
    password: process.env[`SEED_${role}_PASSWORD`],
  })));

  if (!parsed.success) {
    console.error("Isi email sah dan password sepanjang 8–128 karakter untuk ketiga role demo.");
    process.exitCode = 1;
    return;
  }

  if (new Set(parsed.data.map(({ email }) => email)).size !== userRoles.length) {
    console.error("Setiap role demo memerlukan email yang berbeda.");
    process.exitCode = 1;
    return;
  }

  const users = await Promise.all(parsed.data.map(async ({ role, email, password }) => ({
    id: randomUUID(),
    name: accountNames[role],
    role,
    email,
    hash: await hashPassword(password),
  })));

  const db = createDb();
  try {
    const created = await db.$transaction(async (tx) => {
      const inserted = await tx.user.createManyAndReturn({
        data: users.map(({ id, name, role, email }) => ({ id, name, role, email })),
        skipDuplicates: true,
        select: { id: true },
      });

      const newIds = new Set(inserted.map(({ id }) => id));
      if (newIds.size > 0) {
        await tx.account.createMany({
          data: users.filter(({ id }) => newIds.has(id)).map(({ id, hash }) => ({
            id: randomUUID(),
            userId: id,
            accountId: id,
            providerId: "credential",
            password: hash,
          })),
        });
      }

      return newIds.size;
    });

    console.log(`Seed akun demo selesai. ${created} akun dibuat dan ${users.length - created} akun dilewati.`);
    const warehouse = users.find(({ role }) => role === "WAREHOUSE");
    if (warehouse) await seedReceipt(db, warehouse.email);
  } finally {
    await db.$disconnect();
  }
}

seed().catch(() => {
  console.error("Seed demo gagal. Periksa konfigurasi database dan jalankan migrasi terlebih dahulu.");
  process.exitCode = 1;
});
