import "dotenv/config";
import { createDb } from "../src/lib/db.ts";
import { deleteExpiredBuckets } from "../src/lib/rate-limit.ts";

async function cleanup() {
  const db = createDb();
  try {
    console.log(`${await deleteExpiredBuckets(db)} bucket kedaluwarsa dihapus.`);
  } finally {
    await db.$disconnect();
  }
}

cleanup().catch(() => {
  console.error("Cleanup limiter gagal. Periksa koneksi dan migrasi PostgreSQL.");
  process.exitCode = 1;
});
