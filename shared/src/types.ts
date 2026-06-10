export const CHUNK_SIZE = 16;
export const VIEW_DISTANCE_CHUNKS = 1;

export const RESOURCE_TYPES = ["wood", "stone", "iron"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const STRUCTURE_TYPES = ["wall", "storage", "craftingStation"] as const;
export type StructureType = (typeof STRUCTURE_TYPES)[number];

export type Inventory = Record<ResourceType, number>;

export type Position = {
  x: number;
  y: number;
};

export type Direction = "up" | "down" | "left" | "right";

export type PlayerPublic = {
  id: string;
  name: string;
  position: Position;
  connected: boolean;
};

export type ResourceNodeSnapshot = {
  id: string;
  position: Position;
  type: ResourceType;
  amount: number;
  depletedUntil: string | null;
};

export type StructureSnapshot = {
  id: string;
  position: Position;
  type: StructureType;
  ownerId: string;
};

export type TileSnapshot = {
  position: Position;
  resource?: ResourceNodeSnapshot;
  structure?: StructureSnapshot;
};

export type ChunkCoord = {
  cx: number;
  cy: number;
};

export type ChunkSnapshot = ChunkCoord & {
  tiles: TileSnapshot[];
};

export type WorldSnapshot = {
  chunks: ChunkSnapshot[];
  players: PlayerPublic[];
};

export type BuildCost = Record<ResourceType, number>;

export const STRUCTURE_COSTS: Record<StructureType, BuildCost> = {
  wall: { wood: 2, stone: 1, iron: 0 },
  storage: { wood: 5, stone: 2, iron: 0 },
  craftingStation: { wood: 3, stone: 3, iron: 1 }
};

export const EMPTY_INVENTORY: Inventory = {
  wood: 0,
  stone: 0,
  iron: 0
};

export function chunkCoordFor(position: Position): ChunkCoord {
  return {
    cx: Math.floor(position.x / CHUNK_SIZE),
    cy: Math.floor(position.y / CHUNK_SIZE)
  };
}

export function chunkKey(coord: ChunkCoord): string {
  return `${coord.cx}:${coord.cy}`;
}

export function inventoryWithDefaults(value?: Partial<Inventory> | null): Inventory {
  return {
    wood: value?.wood ?? 0,
    stone: value?.stone ?? 0,
    iron: value?.iron ?? 0
  };
}

export function hasItems(inventory: Inventory, cost: Partial<Inventory>): boolean {
  return RESOURCE_TYPES.every((type) => inventory[type] >= (cost[type] ?? 0));
}

export function addInventory(inventory: Inventory, delta: Partial<Inventory>): Inventory {
  return {
    wood: inventory.wood + (delta.wood ?? 0),
    stone: inventory.stone + (delta.stone ?? 0),
    iron: inventory.iron + (delta.iron ?? 0)
  };
}

export function subtractInventory(inventory: Inventory, delta: Partial<Inventory>): Inventory {
  return {
    wood: inventory.wood - (delta.wood ?? 0),
    stone: inventory.stone - (delta.stone ?? 0),
    iron: inventory.iron - (delta.iron ?? 0)
  };
}
