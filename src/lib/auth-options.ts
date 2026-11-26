import type { BetterAuthOptions } from "better-auth";

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
        type: ["EMPLOYEE", "WAREHOUSE", "SUPERADMIN"],
        defaultValue: "EMPLOYEE",
        input: false,
      },
      isActive: { type: "boolean", fieldName: "is_active", defaultValue: true, input: false },
    },
  },
} satisfies BetterAuthOptions;
