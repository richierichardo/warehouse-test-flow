import { expect, it, vi } from "vitest";
import { authEnvSchema } from "../../src/lib/env";
import { trustedClientIp } from "../../src/lib/trusted-ip";

vi.mock("server-only", () => ({}));

const token = "ab".repeat(32);
const env = authEnvSchema.parse({
  BETTER_AUTH_SECRET: "c".repeat(32),
  RATE_LIMIT_KEY_SECRET: "d".repeat(32),
  BETTER_AUTH_URL: "https://warehouse.example.test",
  APP_ORIGIN: "https://warehouse.example.test",
  TRUSTED_PROXY_MODE: "nginx",
  TRUSTED_PROXY_SECRET: token,
});

function proxy(ip: string, proof = token) {
  return new Headers({ "x-warehouse-client-ip": ip, "x-warehouse-proxy-token": proof });
}

it("memakai parser Better Auth untuk IPv4 mapped dan prefix IPv6", () => {
  expect(trustedClientIp(proxy("::ffff:c000:201"), env)).toBe("192.0.2.1");
  expect(trustedClientIp(proxy("2001:db8::9"), env)).toBe(trustedClientIp(proxy("2001:db8::abc"), env));
});

it("memakai fallback saat bukti proxy salah atau jaringan tidak tepercaya", () => {
  expect(trustedClientIp(proxy("192.0.2.1", "cd".repeat(32)), env)).toBeNull();
  expect(trustedClientIp(proxy("192.0.2.1"), { ...env, TRUSTED_PROXY_MODE: "direct" })).toBeNull();
  expect(trustedClientIp(new Headers({ "x-forwarded-for": "192.0.2.1", "x-warehouse-verified-ip": "192.0.2.1" }), env)).toBeNull();
});

it.each(["192.0.2.1, 192.0.2.2", "192.0.2.1:80", "fe80::1%test"])("menolak IP proxy ambigu (%s)", (ip) => {
  expect(trustedClientIp(proxy(ip), env)).toBeNull();
});
