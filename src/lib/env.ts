import { z } from "zod";

export const databaseUrlSchema = z.url({ protocol: /^postgres(?:ql)?$/ });

const originSchema = z.url({ protocol: /^https?$/ })
  .refine((value) => URL.parse(value)?.origin === value, "Gunakan origin tanpa path atau kredensial.");

export const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: originSchema,
  APP_ORIGIN: originSchema,
  RATE_LIMIT_KEY_SECRET: z.string().min(32),
  TRUSTED_PROXY_MODE: z.enum(["direct", "nginx"]).default("direct"),
  TRUSTED_PROXY_SECRET: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
}).superRefine((env, ctx) => {
  if (env.BETTER_AUTH_URL !== env.APP_ORIGIN) {
    ctx.addIssue({ code: "custom", path: ["BETTER_AUTH_URL"], message: "Origin auth dan aplikasi harus sama." });
  }

  const origin = URL.parse(env.APP_ORIGIN);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin?.hostname ?? "");
  if (origin && origin.protocol !== "https:" && (env.NODE_ENV === "production" || !loopback)) {
    ctx.addIssue({ code: "custom", path: ["APP_ORIGIN"], message: "HTTPS wajib di luar development atau tes loopback." });
  }

  if (env.TRUSTED_PROXY_MODE === "nginx" && !/^[a-fA-F0-9]{64}$/.test(env.TRUSTED_PROXY_SECRET ?? "")) {
    ctx.addIssue({ code: "custom", path: ["TRUSTED_PROXY_SECRET"], message: "Mode nginx memerlukan secret proxy 64 digit hex." });
  }
});

export type AuthEnvironment = z.infer<typeof authEnvSchema>;
