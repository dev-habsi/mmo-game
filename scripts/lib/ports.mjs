import net from "node:net";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const rootDir = resolve(here, "../..");
export const envPath = resolve(rootDir, ".env");

export const DEFAULTS = {
  postgres: 4567,
  server: 3000,
  client: 5173
};

export function isPortAvailable(port) {
  return new Promise((resolvePort) => {
    const server = net.createServer();
    server.once("error", () => resolvePort(false));
    server.once("listening", () => {
      server.close(() => resolvePort(true));
    });
    server.listen(port, "0.0.0.0");
  });
}

export async function findAvailablePort(preferred, maxAttempts = 50) {
  for (let port = preferred; port < preferred + maxAttempts; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No free port found near ${preferred}`);
}

export async function canConnectPostgres(databaseUrl) {
  try {
    const pgModule = await import(
      new URL("../../server/node_modules/pg/lib/index.js", import.meta.url).href
    );
    const client = new pgModule.default.Client({ connectionString: databaseUrl });
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

export function parseEnv(content) {
  const values = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }
    values[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return values;
}

export function readEnvFile() {
  if (!existsSync(envPath)) {
    return {};
  }
  return parseEnv(readFileSync(envPath, "utf8"));
}

export function writeEnvFile(updates) {
  const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  let content = current;

  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(content)) {
      content = content.replace(pattern, line);
    } else {
      content = `${content.trimEnd()}\n${line}\n`;
    }
  }

  writeFileSync(envPath, content.startsWith("\n") ? content.trimStart() : content);
}
