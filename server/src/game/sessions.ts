import type { PlayerPublic } from "@shared/game";

export class SessionRegistry {
  private readonly playersBySocket = new Map<string, PlayerPublic>();
  private readonly socketsByPlayer = new Map<string, string>();

  set(socketId: string, player: PlayerPublic): void {
    const previousPlayer = this.playersBySocket.get(socketId);
    if (previousPlayer) {
      this.socketsByPlayer.delete(previousPlayer.id);
    }
    this.playersBySocket.set(socketId, player);
    this.socketsByPlayer.set(player.id, socketId);
  }

  update(player: PlayerPublic): void {
    const socketId = this.socketsByPlayer.get(player.id);
    if (!socketId) {
      return;
    }
    this.playersBySocket.set(socketId, player);
  }

  removeSocket(socketId: string): PlayerPublic | null {
    const player = this.playersBySocket.get(socketId);
    if (!player) {
      return null;
    }
    this.playersBySocket.delete(socketId);
    this.socketsByPlayer.delete(player.id);
    return {
      ...player,
      connected: false
    };
  }

  getBySocket(socketId: string): PlayerPublic | null {
    return this.playersBySocket.get(socketId) ?? null;
  }

  getSocketId(playerId: string): string | null {
    return this.socketsByPlayer.get(playerId) ?? null;
  }

  listPlayers(): PlayerPublic[] {
    return [...this.playersBySocket.values()];
  }
}
