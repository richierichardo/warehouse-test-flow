import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { databaseUrlSchema } from "./env.ts";

export function createDb(value = process.env.DATABASE_URL) {
  const connectionString = databaseUrlSchema.parse(value);
  const adapter = new PrismaPg({ connectionString, options: "-c timezone=UTC" });
  return new PrismaClient({ adapter });
}
