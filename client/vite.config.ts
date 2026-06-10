import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, ".."), "");
  const port = Number(env.CLIENT_PORT ?? 5173);

  return {
    server: {
      host: "0.0.0.0",
      port,
      strictPort: false
    }
  };
});
