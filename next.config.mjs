import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  agentRules: false,
  devIndicators: false,
  turbopack: { root: projectRoot },
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ["better-auth", "@better-auth/prisma-adapter"],
};

export default nextConfig;
