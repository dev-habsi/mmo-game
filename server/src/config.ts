import "dotenv/config";

export type ServerConfig = {
  port: number;
  databaseUrl: string;
  clientOrigin: string;
  autoMigrate: boolean;
};

export function loadConfig(): ServerConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: process.env.DATABASE_URL ?? "postgres://game:game@localhost:5432/game",
    clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    autoMigrate: process.env.AUTO_MIGRATE !== "false"
  };
}
