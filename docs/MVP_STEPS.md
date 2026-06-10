# MVP Implementation Steps

1. Install dependencies with `npm install`.
2. Start PostgreSQL with `docker compose up -d db`.
3. Start server and client with `npm run dev`.
4. Open two browser tabs at `http://localhost:5173`.
5. Join as guests and verify both players see each other.
6. Move with `WASD` or arrows and confirm remote player updates.
7. Stand near a resource node and press `Space` to gather.
8. Place a wall/storage/crafting station from the HUD.
9. Refresh the browser and confirm position, inventory, resources, and structures persist.
10. Trade with another player using target player id and item amounts.

## Production Hardening Later

- Add auth tokens instead of trusting guest player ids.
- Move online session state and fanout into Redis.
- Add optimistic client interpolation and server snapshots.
- Split world into regions or shards.
- Add migration tool such as Drizzle, Kysely, or Prisma migrations.
- Add load tests for movement, gathering, and chunk streaming.
