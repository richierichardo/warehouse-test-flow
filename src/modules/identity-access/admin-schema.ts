import { z } from "zod";
import { userRoles } from "@/lib/auth-options";

export const accountRoleSchema = z.enum(userRoles);
export const accountIdSchema = z.string().min(1).max(255).refine((id) => !id.includes("\0"));
export const accountAccessSchema = z.strictObject({ role: accountRoleSchema.optional(), isActive: z.boolean().optional() })
  .refine(({ role, isActive }) => role !== undefined || isActive !== undefined);
export const revokeSessionsSchema = z.strictObject({});

const integer = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive());
const adminQuerySchema = z.strictObject({ page: integer.default(1), limit: integer.refine((limit) => limit <= 100).default(20) })
  .refine(({ page, limit }) => (page - 1) * limit <= 2_147_483_647);

export function parseAdminQuery(input: URLSearchParams | Record<string, string | string[] | undefined>) {
  if (!(input instanceof URLSearchParams)) return adminQuerySchema.safeParse(input);
  const entries = Array.from(new Set(input.keys()), (key) => {
    const values = input.getAll(key);
    return [key, values.length === 1 ? values[0] : values] as const;
  });
  return adminQuerySchema.safeParse(Object.fromEntries(entries));
}

export type AdminQuery = z.output<typeof adminQuerySchema>;
export type AccessInput = z.output<typeof accountAccessSchema>;
export type AccountAccess = { role: z.output<typeof accountRoleSchema>; isActive: boolean };
export type AdminAccount = AccountAccess & { id: string; name: string; email: string };
