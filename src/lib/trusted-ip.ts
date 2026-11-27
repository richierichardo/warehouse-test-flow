import "server-only";

import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { getIP } from "better-auth/api";
import type { AuthEnvironment } from "./env";

const proxyIpHeader = "x-warehouse-client-ip";
const proxySecretHeader = "x-warehouse-proxy-token";
export const verifiedIpHeader = "x-warehouse-verified-ip";
export const authIpOptions = { ipAddressHeaders: [verifiedIpHeader], ipv6Subnet: 64 };

export function trustedClientIp(headers: Headers, env: AuthEnvironment): string | null {
  if (env.TRUSTED_PROXY_MODE !== "nginx" || !env.TRUSTED_PROXY_SECRET) return null;

  const proof = Buffer.from(headers.get(proxySecretHeader) ?? "");
  const expected = Buffer.from(env.TRUSTED_PROXY_SECRET);
  if (proof.length !== expected.length || !timingSafeEqual(proof, expected)) return null;

  const value = headers.get(proxyIpHeader);
  if (!value || !isIP(value) || value.includes("%")) return null;

  return getIP(new Headers({ [verifiedIpHeader]: value }), { advanced: { ipAddress: authIpOptions } });
}
