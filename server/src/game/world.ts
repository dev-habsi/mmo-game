import {
  CHUNK_SIZE,
  STRUCTURE_COSTS,
  VIEW_DISTANCE_CHUNKS,
  chunkCoordFor,
  hasItems,
  inventoryWithDefaults,
  type BuildIntent,
  type ChunkCoord,
  type ChunkSnapshot,
  type Direction,
  type GatherIntent,
  type Inventory,
  type PlayerPublic,
  type Position,
  type StructureType,
  type TileSnapshot,
  type WorldSnapshot
} from "@shared/game";
import type { GameRepository, PlayerRecord } from "../db/repositories.js";
import type { SessionRegistry } from "./sessions.js";

export class WorldService {
  constructor(
    private readonly repository: GameRepository,
    private readonly sessions: SessionRegistry
  ) {}

  async joinWorld(player: PlayerRecord): Promise<WorldSnapshot> {
    return {
      chunks: await this.loadChunksAround(player.position),
      players: this.sessions.listPlayers()
    };
  }

  async move(playerId: string, direction: Direction): Promise<PlayerPublic> {
    const player = await this.repository.getPlayer(playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    const next = nextPosition(player.position, direction);
    const blocked = await this.repository.getStructureAt(next);
    if (blocked) {
      throw new Error("Tile is blocked");
    }

    const updated = await this.repository.updatePlayerPosition(playerId, next);
    const publicPlayer = toPublicPlayer(updated);
    this.sessions.update(publicPlayer);
    return publicPlayer;
  }

  async gather(playerId: string, input: GatherIntent): Promise<{ inventory: Inventory; tile: TileSnapshot }> {
    const player = await this.repository.getPlayer(playerId);
    if (!player) {
      throw new Error("Player not found");
    }
    if (!isAdjacent(player.position, input.target)) {
      throw new Error("Gather target is too far away");
    }

    const { inventory, resource } = await this.repository.gatherResource(playerId, input.target);
    return {
      inventory,
      tile: {
        position: input.target,
        resource,
        structure: (await this.repository.getStructureAt(input.target)) ?? undefined
      }
    };
  }

  async build(playerId: string, input: BuildIntent): Promise<{ inventory: Inventory; tile: TileSnapshot }> {
    const player = await this.repository.getPlayer(playerId);
    if (!player) {
      throw new Error("Player not found");
    }
    if (!isAdjacent(player.position, input.target)) {
      throw new Error("Build target is too far away");
    }

    const cost = inventoryWithDefaults(STRUCTURE_COSTS[input.type]);
    if (!hasItems(player.inventory, cost)) {
      throw new Error(`Not enough resources for ${input.type}`);
    }

    const { inventory, structure } = await this.repository.placeStructure(playerId, input.target, input.type, cost);
    return {
      inventory,
      tile: {
        position: input.target,
        structure,
        resource: (await this.repository.getResourceAt(input.target)) ?? undefined
      }
    };
  }

  async loadChunksAround(position: Position): Promise<ChunkSnapshot[]> {
    const center = chunkCoordFor(position);
    const chunks: ChunkSnapshot[] = [];
    for (let cx = center.cx - VIEW_DISTANCE_CHUNKS; cx <= center.cx + VIEW_DISTANCE_CHUNKS; cx += 1) {
      for (let cy = center.cy - VIEW_DISTANCE_CHUNKS; cy <= center.cy + VIEW_DISTANCE_CHUNKS; cy += 1) {
        chunks.push(await this.loadChunk({ cx, cy }));
      }
    }
    return chunks;
  }

  async loadChunk(coord: ChunkCoord): Promise<ChunkSnapshot> {
    await this.repository.seedChunk(coord);
    const minX = coord.cx * CHUNK_SIZE;
    const maxX = minX + CHUNK_SIZE - 1;
    const minY = coord.cy * CHUNK_SIZE;
    const maxY = minY + CHUNK_SIZE - 1;
    const [resources, structures] = await Promise.all([
      this.repository.getResourceNodesInBounds(minX, maxX, minY, maxY),
      this.repository.getStructuresInBounds(minX, maxX, minY, maxY)
    ]);

    const tiles = new Map<string, TileSnapshot>();
    for (const resource of resources) {
      tiles.set(positionKey(resource.position), {
        position: resource.position,
        resource
      });
    }
    for (const structure of structures) {
      const key = positionKey(structure.position);
      tiles.set(key, {
        position: structure.position,
        resource: tiles.get(key)?.resource,
        structure
      });
    }

    return {
      ...coord,
      tiles: [...tiles.values()]
    };
  }
}

export function structureLabel(type: StructureType): string {
  if (type === "craftingStation") {
    return "crafting station";
  }
  return type;
}

function nextPosition(position: Position, direction: Direction): Position {
  if (direction === "up") {
    return { x: position.x, y: position.y - 1 };
  }
  if (direction === "down") {
    return { x: position.x, y: position.y + 1 };
  }
  if (direction === "left") {
    return { x: position.x - 1, y: position.y };
  }
  return { x: position.x + 1, y: position.y };
}

function isAdjacent(a: Position, b: Position): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;
}

function toPublicPlayer(player: PlayerRecord): PlayerPublic {
  return {
    id: player.id,
    name: player.name,
    position: player.position,
    connected: true
  };
}

function positionKey(position: Position): string {
  return `${position.x}:${position.y}`;
}
