import type { ClientToServerEvents, ServerToClientEvents } from "@shared/game";
import { io, type Socket } from "socket.io-client";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createGameSocket(): GameSocket {
  const url = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3000";
  return io<ServerToClientEvents, ClientToServerEvents>(url, {
    transports: ["websocket"]
  });
}
