import "server-only";

import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import type { PrismaClient } from "../generated/prisma/client";
import { authOptions } from "./auth-options";
import { createDb } from "./db";
import { authEnvSchema } from "./env";
import { authIpOptions, verifiedIpHeader } from "./trusted-ip";

export const invalidCredentials = { code: "INVALID_EMAIL_OR_PASSWORD", message: "Email atau password salah." };

export function createWarehouseAuth(db: PrismaClient, env = authEnvSchema.parse(process.env)) {
  return betterAuth({
    ...authOptions,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_ORIGIN],
    database: prismaAdapter(db, { provider: "postgresql" }),
    rateLimit: { enabled: false },
    logger: { disabled: true },
    advanced: {
      useSecureCookies: env.APP_ORIGIN.startsWith("https://"),
      ipAddress: { ...authIpOptions, disableIpTracking: env.TRUSTED_PROXY_MODE === "direct" },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session, context) => {
            const user = await db.user.findUnique({
              where: { id: session.userId },
              select: { is_active: true },
            });
            if (!user?.is_active) throw new APIError("UNAUTHORIZED", invalidCredentials);

            const ipAddress = (context?.headers ?? context?.request?.headers)?.get(verifiedIpHeader) ?? null;
            return { data: { ipAddress } };
          },
        },
      },
    },
  });
}

function createAuthRuntime() {
  const env = authEnvSchema.parse(process.env);
  const db = createDb();
  return { db, env, auth: createWarehouseAuth(db, env) };
}

let authRuntime: ReturnType<typeof createAuthRuntime> | undefined;

export function getAuthRuntime() {
  return authRuntime ??= createAuthRuntime();
}
