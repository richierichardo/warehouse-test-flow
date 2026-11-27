import type { BetterAuthOptions } from "better-auth";

export const userRoles = ["EMPLOYEE", "WAREHOUSE", "SUPERADMIN"] as const;

export const authOptions = {
  emailAndPassword: { enabled: true, disableSignUp: true },
  session: {
    expiresIn: 8 * 60 * 60,
    disableSessionRefresh: true,
    cookieCache: { enabled: false },
  },
  user: {
    additionalFields: {
      role: {
        type: [...userRoles],
        defaultValue: "EMPLOYEE",
        input: false,
      },
      isActive: { type: "boolean", fieldName: "is_active", defaultValue: true, input: false },
    },
  },
} satisfies BetterAuthOptions;
