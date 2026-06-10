import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env")
});

export type ServerConfig = {
  port: number;
  databaseUrl: string;
  clientOrigin: string;
  autoMigrate: boolean;
};

export function loadConfig(): ServerConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: process.env.DATABASE_URL ?? "postgres://game:game@localhost:4567/game",
    clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    autoMigrate: process.env.AUTO_MIGRATE !== "false"
  };
}
