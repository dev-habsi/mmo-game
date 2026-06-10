import {
  DEFAULTS,
  canConnectPostgres,
  findAvailablePort,
  isPortAvailable,
  readEnvFile,
  writeEnvFile
} from "./lib/ports.mjs";

async function resolvePostgresPort(existing) {
  const preferred = Number(existing) || DEFAULTS.postgres;
  const preferredUrl = `postgres://game:game@localhost:${preferred}/game`;

  if (await canConnectPostgres(preferredUrl)) {
    return preferred;
  }
  if (await isPortAvailable(preferred)) {
    return preferred;
  }
  return findAvailablePort(preferred + 1);
}

async function resolveAppPort(existing, preferred) {
  const candidate = Number(existing) || preferred;
  if (await isPortAvailable(candidate)) {
    return candidate;
  }
  return findAvailablePort(preferred);
}

async function main() {
  const env = readEnvFile();
  const postgresPort = await resolvePostgresPort(env.POSTGRES_PORT);
  const serverPort = await resolveAppPort(env.PORT, DEFAULTS.server);
  const clientPort = await resolveAppPort(env.CLIENT_PORT, DEFAULTS.client);

  const updates = {
    POSTGRES_PORT: String(postgresPort),
    PORT: String(serverPort),
    CLIENT_PORT: String(clientPort),
    CLIENT_ORIGIN: `http://localhost:${clientPort}`,
    VITE_SERVER_URL: `http://localhost:${serverPort}`,
    DATABASE_URL: `postgres://game:game@localhost:${postgresPort}/game`
  };

  writeEnvFile(updates);

  console.log("Resolved dev ports:");
  console.log(`  postgres: ${postgresPort}`);
  console.log(`  server:   ${serverPort}`);
  console.log(`  client:   ${clientPort}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
