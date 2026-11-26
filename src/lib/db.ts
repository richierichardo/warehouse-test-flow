import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { databaseUrlSchema } from "./env";

export function createDb(value = process.env.DATABASE_URL) {
  const connectionString = databaseUrlSchema.parse(value);
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
