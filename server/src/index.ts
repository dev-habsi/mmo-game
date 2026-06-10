import cors from "@fastify/cors";
import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { applySchema, createPool } from "./db/pool.js";
import { GameRepository } from "./db/repositories.js";
import { SessionRegistry } from "./game/sessions.js";
import { TradingService } from "./game/trading.js";
import { WorldService } from "./game/world.js";
import { attachSocketServer } from "./net/socket.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = Fastify({
    logger: true
  });
  await app.register(cors, {
    origin: config.clientOrigin
  });

  const pool = createPool(config);
  if (config.autoMigrate) {
    await applySchema(pool);
  }

  const repository = new GameRepository(pool);
  const sessions = new SessionRegistry();
  const world = new WorldService(repository, sessions);
  const trading = new TradingService(repository);
  attachSocketServer(app.server, {
    clientOrigin: config.clientOrigin,
    repository,
    sessions,
    trading,
    world
  });

  app.get("/health", async () => ({
    ok: true,
    playersOnline: sessions.listPlayers().length
  }));

  const shutdown = async (): Promise<void> => {
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await app.listen({
    host: "0.0.0.0",
    port: config.port
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
