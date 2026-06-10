import type pg from "pg";
import {
  EMPTY_INVENTORY,
  RESOURCE_TYPES,
  addInventory,
  inventoryWithDefaults,
  subtractInventory,
  type ChunkCoord,
  type Inventory,
  type PlayerPublic,
  type Position,
  type ResourceNodeSnapshot,
  type ResourceType,
  type StructureSnapshot,
  type StructureType
} from "@shared/game";

type PlayerRow = {
  id: string;
  name: string;
  x: number;
  y: number;
  inventory: Partial<Inventory>;
};

type ResourceRow = {
  id: string;
  x: number;
  y: number;
  type: ResourceType;
  amount: number;
  max_amount: number;
  depleted_until: Date | null;
};

type StructureRow = {
  id: string;
  x: number;
  y: number;
  type: StructureType;
  owner_id: string;
};

export type PlayerRecord = PlayerPublic & {
  inventory: Inventory;
};

export class GameRepository {
  constructor(private readonly pool: pg.Pool) {}

  async getOrCreatePlayer(input: { playerId?: string; name?: string }): Promise<PlayerRecord> {
    if (input.playerId) {
      const existing = await this.pool.query<PlayerRow>(
        "SELECT id, name, x, y, inventory FROM players WHERE id = $1",
        [input.playerId]
      );
      if (existing.rowCount) {
        await this.touchPlayer(input.playerId);
        return this.toPlayerRecord(existing.rows[0], true);
      }
    }

    const name = cleanName(input.name);
    const created = await this.pool.query<PlayerRow>(
      `INSERT INTO players (name, inventory)
       VALUES ($1, $2)
       RETURNING id, name, x, y, inventory`,
      [name, EMPTY_INVENTORY]
    );

    return this.toPlayerRecord(created.rows[0], true);
  }

  async touchPlayer(playerId: string): Promise<void> {
    await this.pool.query("UPDATE players SET last_seen_at = now(), updated_at = now() WHERE id = $1", [playerId]);
  }

  async updatePlayerPosition(playerId: string, position: Position): Promise<PlayerRecord> {
    const result = await this.pool.query<PlayerRow>(
      `UPDATE players
       SET x = $2, y = $3, last_seen_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING id, name, x, y, inventory`,
      [playerId, position.x, position.y]
    );
    return this.toPlayerRecord(result.rows[0], true);
  }

  async updateInventory(playerId: string, inventory: Inventory, client?: pg.PoolClient): Promise<Inventory> {
    const db = client ?? this.pool;
    const result = await db.query<PlayerRow>(
      `UPDATE players
       SET inventory = $2, updated_at = now()
       WHERE id = $1
       RETURNING inventory`,
      [playerId, inventory]
    );
    return inventoryWithDefaults(result.rows[0]?.inventory);
  }

  async getPlayer(playerId: string, client?: pg.PoolClient): Promise<PlayerRecord | null> {
    const db = client ?? this.pool;
    const result = await db.query<PlayerRow>("SELECT id, name, x, y, inventory FROM players WHERE id = $1", [playerId]);
    return result.rowCount ? this.toPlayerRecord(result.rows[0], true) : null;
  }

  async getPlayersByIds(playerIds: string[], client?: pg.PoolClient): Promise<PlayerRecord[]> {
    if (!playerIds.length) {
      return [];
    }
    const db = client ?? this.pool;
    const result = await db.query<PlayerRow>("SELECT id, name, x, y, inventory FROM players WHERE id = ANY($1::uuid[])", [
      playerIds
    ]);
    return result.rows.map((row) => this.toPlayerRecord(row, false));
  }

  async getStructuresInBounds(minX: number, maxX: number, minY: number, maxY: number): Promise<StructureSnapshot[]> {
    const result = await this.pool.query<StructureRow>(
      `SELECT id, x, y, type, owner_id
       FROM structures
       WHERE x BETWEEN $1 AND $2 AND y BETWEEN $3 AND $4`,
      [minX, maxX, minY, maxY]
    );
    return result.rows.map(toStructureSnapshot);
  }

  async getResourceNodesInBounds(minX: number, maxX: number, minY: number, maxY: number): Promise<ResourceNodeSnapshot[]> {
    const result = await this.pool.query<ResourceRow>(
      `SELECT id, x, y, type, amount, max_amount, depleted_until
       FROM resource_nodes
       WHERE x BETWEEN $1 AND $2 AND y BETWEEN $3 AND $4`,
      [minX, maxX, minY, maxY]
    );
    return result.rows.map(toResourceSnapshot);
  }

  async getStructureAt(position: Position, client?: pg.PoolClient): Promise<StructureSnapshot | null> {
    const db = client ?? this.pool;
    const result = await db.query<StructureRow>("SELECT id, x, y, type, owner_id FROM structures WHERE x = $1 AND y = $2", [
      position.x,
      position.y
    ]);
    return result.rowCount ? toStructureSnapshot(result.rows[0]) : null;
  }

  async getResourceAt(position: Position, client?: pg.PoolClient): Promise<ResourceNodeSnapshot | null> {
    const db = client ?? this.pool;
    const result = await db.query<ResourceRow>(
      "SELECT id, x, y, type, amount, max_amount, depleted_until FROM resource_nodes WHERE x = $1 AND y = $2",
      [position.x, position.y]
    );
    return result.rowCount ? toResourceSnapshot(result.rows[0]) : null;
  }

  async seedChunk(coord: ChunkCoord): Promise<void> {
    const minX = coord.cx * 16;
    const minY = coord.cy * 16;
    const occupied = new Set(
      (await this.getStructuresInBounds(minX, minX + 15, minY, minY + 15)).map((structure) =>
        positionKey(structure.position)
      )
    );
    const values: Array<[number, number, ResourceType, number]> = [];

    for (let x = minX; x < minX + 16; x += 1) {
      for (let y = minY; y < minY + 16; y += 1) {
        if (x === 0 && y === 0) {
          continue;
        }
        const roll = stableHash(x, y);
        if (roll % 17 !== 0 || occupied.has(positionKey({ x, y }))) {
          continue;
        }
        const type = RESOURCE_TYPES[roll % RESOURCE_TYPES.length];
        values.push([x, y, type, maxAmountFor(type)]);
      }
    }

    for (const [x, y, type, amount] of values) {
      await this.pool.query(
        `INSERT INTO resource_nodes (x, y, type, amount, max_amount)
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (x, y) DO NOTHING`,
        [x, y, type, amount]
      );
    }
  }

  async gatherResource(playerId: string, target: Position): Promise<{ inventory: Inventory; resource: ResourceNodeSnapshot }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const player = await this.getPlayer(playerId, client);
      if (!player) {
        throw new Error("Player not found");
      }

      const resourceResult = await client.query<ResourceRow>(
        `SELECT id, x, y, type, amount, max_amount, depleted_until
         FROM resource_nodes
         WHERE x = $1 AND y = $2
         FOR UPDATE`,
        [target.x, target.y]
      );

      if (!resourceResult.rowCount) {
        throw new Error("No resource node on target tile");
      }

      let resource = resourceResult.rows[0];
      if (resource.amount <= 0 && resource.depleted_until && resource.depleted_until.getTime() <= Date.now()) {
        const reset = await client.query<ResourceRow>(
          `UPDATE resource_nodes
           SET amount = max_amount, depleted_until = NULL, updated_at = now()
           WHERE id = $1
           RETURNING id, x, y, type, amount, max_amount, depleted_until`,
          [resource.id]
        );
        resource = reset.rows[0];
      }

      if (resource.amount <= 0) {
        throw new Error("Resource node is depleted");
      }

      const newAmount = resource.amount - 1;
      const depletedUntil = newAmount === 0 ? new Date(Date.now() + 30_000) : null;
      const updatedResource = await client.query<ResourceRow>(
        `UPDATE resource_nodes
         SET amount = $2, depleted_until = $3, updated_at = now()
         WHERE id = $1
         RETURNING id, x, y, type, amount, max_amount, depleted_until`,
        [resource.id, newAmount, depletedUntil]
      );

      const inventory = addInventory(player.inventory, { [resource.type]: 1 });
      const savedInventory = await this.updateInventory(playerId, inventory, client);
      await client.query("COMMIT");

      return {
        inventory: savedInventory,
        resource: toResourceSnapshot(updatedResource.rows[0])
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async placeStructure(
    playerId: string,
    target: Position,
    type: StructureType,
    cost: Inventory
  ): Promise<{ inventory: Inventory; structure: StructureSnapshot }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const player = await this.getPlayer(playerId, client);
      if (!player) {
        throw new Error("Player not found");
      }

      const structureAtTarget = await this.getStructureAt(target, client);
      if (structureAtTarget) {
        throw new Error("Tile already has a structure");
      }

      const resourceAtTarget = await this.getResourceAt(target, client);
      if (resourceAtTarget && resourceAtTarget.amount > 0) {
        throw new Error("Tile has an active resource");
      }

      const inventory = subtractInventory(player.inventory, cost);
      const savedInventory = await this.updateInventory(playerId, inventory, client);
      const inserted = await client.query<StructureRow>(
        `INSERT INTO structures (x, y, type, owner_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, x, y, type, owner_id`,
        [target.x, target.y, type, playerId]
      );
      await client.query("COMMIT");

      return {
        inventory: savedInventory,
        structure: toStructureSnapshot(inserted.rows[0])
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async transferTrade(input: {
    tradeId: string;
    requesterId: string;
    targetId: string;
    offer: Inventory;
    request: Inventory;
  }): Promise<{ requesterInventory: Inventory; targetInventory: Inventory }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const [requester, target] = await Promise.all([
        this.getPlayer(input.requesterId, client),
        this.getPlayer(input.targetId, client)
      ]);
      if (!requester || !target) {
        throw new Error("Trade player not found");
      }

      const requesterInventory = addInventory(subtractInventory(requester.inventory, input.offer), input.request);
      const targetInventory = addInventory(subtractInventory(target.inventory, input.request), input.offer);

      if (Object.values(requesterInventory).some((value) => value < 0) || Object.values(targetInventory).some((value) => value < 0)) {
        throw new Error("Trade inventory is no longer available");
      }

      const savedRequester = await this.updateInventory(requester.id, requesterInventory, client);
      const savedTarget = await this.updateInventory(target.id, targetInventory, client);
      await client.query(
        `UPDATE trades
         SET status = 'accepted', resolved_at = now()
         WHERE id = $1`,
        [input.tradeId]
      );
      await client.query("COMMIT");

      return {
        requesterInventory: savedRequester,
        targetInventory: savedTarget
      };
    } catch (error) {
      await client.query("ROLLBACK");
      await this.pool.query("UPDATE trades SET status = 'failed', resolved_at = now() WHERE id = $1", [input.tradeId]);
      throw error;
    } finally {
      client.release();
    }
  }

  async createTrade(input: {
    requesterId: string;
    targetId: string;
    offer: Inventory;
    request: Inventory;
  }): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO trades (requester_id, target_id, offer, request)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [input.requesterId, input.targetId, input.offer, input.request]
    );
    return result.rows[0].id;
  }

  async closeTrade(tradeId: string, status: "declined" | "failed"): Promise<void> {
    await this.pool.query("UPDATE trades SET status = $2, resolved_at = now() WHERE id = $1", [tradeId, status]);
  }

  private toPlayerRecord(row: PlayerRow, connected: boolean): PlayerRecord {
    return {
      id: row.id,
      name: row.name,
      connected,
      position: { x: row.x, y: row.y },
      inventory: inventoryWithDefaults(row.inventory)
    };
  }
}

function toResourceSnapshot(row: ResourceRow): ResourceNodeSnapshot {
  return {
    id: row.id,
    position: { x: row.x, y: row.y },
    type: row.type,
    amount: row.amount,
    depletedUntil: row.depleted_until?.toISOString() ?? null
  };
}

function toStructureSnapshot(row: StructureRow): StructureSnapshot {
  return {
    id: row.id,
    position: { x: row.x, y: row.y },
    type: row.type,
    ownerId: row.owner_id
  };
}

function cleanName(name?: string): string {
  const trimmed = name?.trim().slice(0, 24);
  return trimmed || `Guest-${Math.floor(Math.random() * 9999).toString().padStart(4, "0")}`;
}

function stableHash(x: number, y: number): number {
  let hash = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function maxAmountFor(type: ResourceType): number {
  if (type === "iron") {
    return 3;
  }
  if (type === "stone") {
    return 4;
  }
  return 5;
}

function positionKey(position: Position): string {
  return `${position.x}:${position.y}`;
}
