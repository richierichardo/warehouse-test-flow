import { z } from "zod";

export const databaseUrlSchema = z.url({ protocol: /^postgres(?:ql)?$/ });

export const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
});
