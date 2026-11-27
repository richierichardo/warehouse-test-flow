import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { userRoles } from "../src/lib/auth-options.ts";
import { createDb } from "../src/lib/db.ts";

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

    console.log(`Seed demo selesai. ${created} akun dibuat dan ${users.length - created} akun dilewati.`);
  } finally {
    await db.$disconnect();
  }
}

seed().catch(() => {
  console.error("Seed demo gagal. Periksa konfigurasi database dan jalankan migrasi terlebih dahulu.");
  process.exitCode = 1;
});
