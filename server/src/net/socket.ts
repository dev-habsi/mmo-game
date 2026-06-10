import type { Server as HttpServer } from "node:http";
import {
  type Ack,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData
} from "@shared/game";
import { Server as SocketServer } from "socket.io";
import type { GameRepository } from "../db/repositories.js";
import type { SessionRegistry } from "../game/sessions.js";
import type { TradingService } from "../game/trading.js";
import type { WorldService } from "../game/world.js";

type GameSocketServer = SocketServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function attachSocketServer(
  httpServer: HttpServer,
  deps: {
    clientOrigin: string;
    repository: GameRepository;
    sessions: SessionRegistry;
    trading: TradingService;
    world: WorldService;
  }
): GameSocketServer {
  const io: GameSocketServer = new SocketServer(httpServer, {
    cors: {
      origin: deps.clientOrigin,
      credentials: false
    }
  });

  io.on("connection", (socket) => {
    socket.on("join", async (input, ack) => {
      await respond(ack, async () => {
        const player = await deps.repository.getOrCreatePlayer(input);
        const publicPlayer = {
          id: player.id,
          name: player.name,
          position: player.position,
          connected: true
        };
        socket.data.playerId = player.id;
        deps.sessions.set(socket.id, publicPlayer);
        socket.join("world");

        const world = await deps.world.joinWorld(player);
        socket.to("world").emit("player:joined", publicPlayer);

        return {
          player: publicPlayer,
          inventory: player.inventory,
          world
        };
      });
    });

    socket.on("move", async (input, ack) => {
      await respond(ack, async () => {
        const playerId = requirePlayer(socket.data.playerId);
        const player = await deps.world.move(playerId, input.direction);
        io.to("world").emit("player:moved", player);
        const chunks = await deps.world.loadChunksAround(player.position);
        for (const chunk of chunks) {
          socket.emit("world:chunk", chunk);
        }
        return player;
      });
    });

    socket.on("gather", async (input, ack) => {
      await respond(ack, async () => {
        const playerId = requirePlayer(socket.data.playerId);
        const result = await deps.world.gather(playerId, input);
        socket.emit("inventory:update", result.inventory);
        io.to("world").emit("world:tile", result.tile);
        io.to("world").emit("event", {
          type: "resourceGathered",
          playerId,
          resource: result.tile.resource!.type,
          amount: 1,
          target: input.target
        });
        return {
          inventory: result.inventory,
          resource: result.tile.resource!
        };
      });
    });

    socket.on("build", async (input, ack) => {
      await respond(ack, async () => {
        const playerId = requirePlayer(socket.data.playerId);
        const result = await deps.world.build(playerId, input);
        socket.emit("inventory:update", result.inventory);
        io.to("world").emit("world:tile", result.tile);
        io.to("world").emit("event", {
          type: "structureBuilt",
          playerId,
          structure: result.tile.structure!
        });
        return {
          inventory: result.inventory,
          structure: result.tile.structure!
        };
      });
    });

    socket.on("trade:request", async (input, ack) => {
      await respond(ack, async () => {
        const playerId = requirePlayer(socket.data.playerId);
        const targetSocketId = deps.sessions.getSocketId(input.targetPlayerId);
        if (!targetSocketId) {
          throw new Error("Target player is offline");
        }
        const trade = await deps.trading.createRequest(playerId, input);
        io.to(targetSocketId).emit("trade:request", trade);
        return trade;
      });
    });

    socket.on("trade:respond", async (input, ack) => {
      await respond(ack, async () => {
        const playerId = requirePlayer(socket.data.playerId);
        const result = await deps.trading.respond(playerId, input);
        const requesterSocketId = deps.sessions.getSocketId(result.requesterId);
        const targetSocketId = deps.sessions.getSocketId(result.targetId);

        if (result.status === "accepted") {
          if (requesterSocketId && result.requesterInventory) {
            io.to(requesterSocketId).emit("inventory:update", result.requesterInventory);
          }
          if (targetSocketId && result.targetInventory) {
            io.to(targetSocketId).emit("inventory:update", result.targetInventory);
          }
          io.to("world").emit("event", {
            type: "tradeCompleted",
            tradeId: input.tradeId,
            playerIds: [result.requesterId, result.targetId]
          });
        }

        if (requesterSocketId) {
          io.to(requesterSocketId).emit("trade:closed", {
            tradeId: input.tradeId,
            status: result.status
          });
        }
        if (targetSocketId) {
          io.to(targetSocketId).emit("trade:closed", {
            tradeId: input.tradeId,
            status: result.status
          });
        }

        return {
          inventory: result.targetInventory ?? (await deps.repository.getPlayer(playerId))!.inventory
        };
      });
    });

    socket.on("disconnect", async () => {
      const player = deps.sessions.removeSocket(socket.id);
      if (!player) {
        return;
      }
      await deps.repository.touchPlayer(player.id);
      socket.to("world").emit("player:left", player.id);
    });
  });

  setInterval(() => {
    const expired = deps.trading.expireOldTrades();
    for (const tradeId of expired) {
      io.to("world").emit("trade:closed", {
        tradeId,
        status: "failed"
      });
      void deps.repository.closeTrade(tradeId, "failed");
    }
  }, 15_000).unref();

  return io;
}

async function respond<T>(ack: (result: Ack<T>) => void, handler: () => Promise<T>): Promise<void> {
  try {
    ack({
      ok: true,
      data: await handler()
    });
  } catch (error) {
    ack({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown server error"
    });
  }
}

function requirePlayer(playerId?: string): string {
  if (!playerId) {
    throw new Error("Join world before sending intents");
  }
  return playerId;
}
