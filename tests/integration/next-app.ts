import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!address || typeof address === "string") throw new Error("Port tes tidak tersedia.");
  return address.port;
}

export async function startNextTestApp(env: Record<string, string>) {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let logs = "";
  const appendLog = (chunk: Buffer) => { logs = (logs + chunk.toString()).slice(-32_768); };
  child.stdout.on("data", appendLog);
  child.stderr.on("data", appendLog);
  let spawnFailed = false;
  child.on("error", () => { spawnFailed = true; });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const app = {
    request(path: string, init?: RequestInit) {
      return fetch(`${baseUrl}${path}`, { redirect: "manual", signal: AbortSignal.timeout(10_000), ...init });
    },
    logs: () => logs,
    async stop() {
      if (child.exitCode === null && child.signalCode === null && !spawnFailed) child.kill();
      await closed;
    },
  };

  for (let attempt = 0; attempt < 80 && child.exitCode === null && !spawnFailed; attempt += 1) {
    const response = await fetch(baseUrl, { method: "HEAD", signal: AbortSignal.timeout(700) }).catch(() => null);
    if (response?.ok) return app;
    await delay(150);
  }
  await app.stop();
  throw new Error("Next.js tes tidak tersedia. Jalankan npm run build sebelum tes integrasi.");
}
