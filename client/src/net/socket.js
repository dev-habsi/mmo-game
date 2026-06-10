import { io } from "socket.io-client";
export function createGameSocket() {
    const url = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3000";
    return io(url, {
        transports: ["websocket"]
    });
}
