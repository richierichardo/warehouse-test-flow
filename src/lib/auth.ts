import "server-only";

import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import type { PrismaClient } from "../generated/prisma/client";
import { authOptions } from "./auth-options";
import { authEnvSchema } from "./env";

export function createWarehouseAuth(db: PrismaClient) {
  const env = authEnvSchema.parse(process.env);

  return betterAuth({
    ...authOptions,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(db, { provider: "postgresql" }),
  });
}
