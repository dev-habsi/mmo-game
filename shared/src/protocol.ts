import type {
  ChunkSnapshot,
  Direction,
  Inventory,
  PlayerPublic,
  Position,
  ResourceNodeSnapshot,
  ResourceType,
  StructureSnapshot,
  StructureType,
  TileSnapshot,
  WorldSnapshot
} from "./types.js";

export type Ack<T = unknown> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

export type JoinInput = {
  playerId?: string;
  name?: string;
};

export type JoinResult = {
  player: PlayerPublic;
  inventory: Inventory;
  world: WorldSnapshot;
};

export type MoveIntent = {
  direction: Direction;
  seq?: number;
};

export type GatherIntent = {
  target: Position;
};

export type BuildIntent = {
  target: Position;
  type: StructureType;
};

export type TradeRequestInput = {
  targetPlayerId: string;
  offer: Partial<Record<ResourceType, number>>;
  request: Partial<Record<ResourceType, number>>;
};

export type TradeRequest = TradeRequestInput & {
  id: string;
  fromPlayerId: string;
  fromPlayerName: string;
};

export type TradeResponseInput = {
  tradeId: string;
  accept: boolean;
};

export type GameEvent =
  | {
      type: "resourceGathered";
      playerId: string;
      resource: ResourceType;
      amount: number;
      target: Position;
    }
  | {
      type: "structureBuilt";
      playerId: string;
      structure: StructureSnapshot;
    }
  | {
      type: "tradeCompleted";
      tradeId: string;
      playerIds: [string, string];
    };

export type ClientToServerEvents = {
  join: (input: JoinInput, ack: (result: Ack<JoinResult>) => void) => void;
  move: (input: MoveIntent, ack: (result: Ack<PlayerPublic>) => void) => void;
  gather: (input: GatherIntent, ack: (result: Ack<{ inventory: Inventory; resource: ResourceNodeSnapshot }>) => void) => void;
  build: (input: BuildIntent, ack: (result: Ack<{ inventory: Inventory; structure: StructureSnapshot }>) => void) => void;
  "trade:request": (input: TradeRequestInput, ack: (result: Ack<TradeRequest>) => void) => void;
  "trade:respond": (input: TradeResponseInput, ack: (result: Ack<{ inventory: Inventory }>) => void) => void;
};

export type ServerToClientEvents = {
  "player:joined": (player: PlayerPublic) => void;
  "player:left": (playerId: string) => void;
  "player:moved": (player: PlayerPublic) => void;
  "inventory:update": (inventory: Inventory) => void;
  "world:chunk": (chunk: ChunkSnapshot) => void;
  "world:tile": (tile: TileSnapshot) => void;
  "trade:request": (request: TradeRequest) => void;
  "trade:closed": (payload: { tradeId: string; status: "accepted" | "declined" | "failed" }) => void;
  event: (event: GameEvent) => void;
  error: (message: string) => void;
};

export type InterServerEvents = Record<string, never>;

export type SocketData = {
  playerId?: string;
};
