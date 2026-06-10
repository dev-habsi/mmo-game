# Shared World Sandbox MVP

Browser-based light MMO foundation: authoritative server, persistent 2D grid world, real-time movement, gathering, building, and simple trades.

## Stack

- Client: Vite + Phaser + Socket.io client
- Server: Node.js + Fastify + Socket.io
- Shared: TypeScript event/types package
- Database: PostgreSQL
- Dev ops: Docker Compose

Redis is intentionally not part of the MVP. The server keeps only connection/session state in memory and persists gameplay state to Postgres. Add Redis later behind the repository/session boundaries for multi-instance fanout and hot world cache.

## Layout

```text
client/      Phaser browser client and HUD
server/      Authoritative game server
shared/      Protocol and domain types
database/    PostgreSQL schema
docs/        Architecture and implementation notes
```

## Quick Start

```bash
npm install
cp .env.example .env
docker compose up -d db
npm run dev
```

Postgres runs on host port **4567** (avoids conflict with a local install on 5432).

Open two browser tabs at `http://localhost:5173`.

## Controls

- Move: `WASD` or arrow keys
- Gather: `Space`
- Build: HUD buttons for wall, storage, crafting station
- Trade: enter target player id and item amounts in HUD
