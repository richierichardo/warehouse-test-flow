import "server-only";

import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client";
import { getAuthRuntime } from "./auth";
import { userRoles } from "./auth-options";

export const principalSchema = z.object({ id: z.string(), name: z.string(), email: z.string(), role: z.enum(userRoles) });
export type Principal = z.infer<typeof principalSchema>;

export async function findActivePrincipal(db: PrismaClient, id: string): Promise<Principal | null> {
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, is_active: true },
  });
  return user?.is_active ? principalSchema.parse(user) : null;
}

export class PrincipalRequiredError extends Error {
  readonly status = 401;

  constructor() {
    super("Silakan masuk untuk melanjutkan.");
    this.name = "PrincipalRequiredError";
  }
}

export async function requirePrincipal(headers: Headers): Promise<Principal> {
  const { db, auth } = getAuthRuntime();
  const session = await auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } });
  const principal = session ? await findActivePrincipal(db, session.user.id) : null;
  if (!principal) throw new PrincipalRequiredError();
  return principal;
}
