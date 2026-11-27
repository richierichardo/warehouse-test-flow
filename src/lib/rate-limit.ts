import "server-only";

import { createHmac } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client";

const authLimits = { login: 10, auth: 120 };
type AuthBucket = keyof typeof authLimits;

export async function consumeAuthQuota(db: PrismaClient, secret: string, bucket: AuthBucket, ip: string | null) {
  const keyHash = createHmac("sha256", secret).update(`${bucket}\0${ip ?? "shared"}`).digest("hex");
  const [result] = await db.$queryRaw<Array<{ allowed: boolean; retryAfter: number }>>`
    WITH current_window AS (
      SELECT date_trunc('minute', statement_timestamp()) AS starts_at
    ), consumed AS (
      INSERT INTO rate_limit_bucket (key_hash, window_start, count, expires_at)
      SELECT ${keyHash}, starts_at, 1, starts_at + interval '1 minute'
      FROM current_window
      ON CONFLICT (key_hash, window_start) DO UPDATE
      SET count = rate_limit_bucket.count + 1
      WHERE rate_limit_bucket.count < ${authLimits[bucket]}
      RETURNING 1
    )
    SELECT EXISTS(SELECT 1 FROM consumed) AS allowed,
      GREATEST(1, ceil(EXTRACT(EPOCH FROM (starts_at + interval '1 minute' - clock_timestamp()))))::int AS "retryAfter"
    FROM current_window
  `;

  if (!result) throw new Error("PostgreSQL tidak mengembalikan hasil rate limit.");
  return result;
}
