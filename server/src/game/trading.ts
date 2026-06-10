import {
  RESOURCE_TYPES,
  hasItems,
  inventoryWithDefaults,
  type Inventory,
  type TradeRequest,
  type TradeRequestInput,
  type TradeResponseInput
} from "@shared/game";
import type { GameRepository } from "../db/repositories.js";

type PendingTrade = TradeRequest & {
  createdAt: number;
};

export class TradingService {
  private readonly pendingTrades = new Map<string, PendingTrade>();

  constructor(private readonly repository: GameRepository) {}

  async createRequest(fromPlayerId: string, input: TradeRequestInput): Promise<TradeRequest> {
    if (fromPlayerId === input.targetPlayerId) {
      throw new Error("Cannot trade with yourself");
    }

    const requester = await this.repository.getPlayer(fromPlayerId);
    const target = await this.repository.getPlayer(input.targetPlayerId);
    if (!requester || !target) {
      throw new Error("Trade target not found");
    }

    const offer = sanitizeItems(input.offer);
    const request = sanitizeItems(input.request);
    if (totalItems(offer) <= 0 && totalItems(request) <= 0) {
      throw new Error("Trade must include at least one item");
    }
    if (!hasItems(requester.inventory, offer)) {
      throw new Error("You do not have offered items");
    }
    if (!hasItems(target.inventory, request)) {
      throw new Error("Target does not have requested items");
    }

    const tradeId = await this.repository.createTrade({
      requesterId: requester.id,
      targetId: target.id,
      offer,
      request
    });

    const trade: PendingTrade = {
      id: tradeId,
      fromPlayerId: requester.id,
      fromPlayerName: requester.name,
      targetPlayerId: target.id,
      offer,
      request,
      createdAt: Date.now()
    };
    this.pendingTrades.set(trade.id, trade);
    return stripInternal(trade);
  }

  async respond(
    targetPlayerId: string,
    input: TradeResponseInput
  ): Promise<{
    status: "accepted" | "declined";
    requesterId: string;
    targetId: string;
    requesterInventory?: Inventory;
    targetInventory?: Inventory;
  }> {
    const trade = this.pendingTrades.get(input.tradeId);
    if (!trade) {
      throw new Error("Trade request not found or expired");
    }
    if (trade.targetPlayerId !== targetPlayerId) {
      throw new Error("Trade request belongs to another player");
    }

    this.pendingTrades.delete(trade.id);
    if (!input.accept) {
      await this.repository.closeTrade(trade.id, "declined");
      return {
        status: "declined",
        requesterId: trade.fromPlayerId,
        targetId: trade.targetPlayerId
      };
    }

    const result = await this.repository.transferTrade({
      tradeId: trade.id,
      requesterId: trade.fromPlayerId,
      targetId: trade.targetPlayerId,
      offer: inventoryWithDefaults(trade.offer),
      request: inventoryWithDefaults(trade.request)
    });

    return {
      status: "accepted",
      requesterId: trade.fromPlayerId,
      targetId: trade.targetPlayerId,
      requesterInventory: result.requesterInventory,
      targetInventory: result.targetInventory
    };
  }

  expireOldTrades(maxAgeMs = 60_000): string[] {
    const now = Date.now();
    const expired: string[] = [];
    for (const [tradeId, trade] of this.pendingTrades.entries()) {
      if (now - trade.createdAt > maxAgeMs) {
        this.pendingTrades.delete(tradeId);
        expired.push(tradeId);
      }
    }
    return expired;
  }
}

function sanitizeItems(items: TradeRequestInput["offer"]): Inventory {
  const inventory = inventoryWithDefaults();
  for (const type of RESOURCE_TYPES) {
    const value = Math.floor(Number(items[type] ?? 0));
    inventory[type] = Number.isFinite(value) && value > 0 ? value : 0;
  }
  return inventory;
}

function totalItems(inventory: Inventory): number {
  return RESOURCE_TYPES.reduce((sum, type) => sum + inventory[type], 0);
}

function stripInternal(trade: PendingTrade): TradeRequest {
  return {
    id: trade.id,
    fromPlayerId: trade.fromPlayerId,
    fromPlayerName: trade.fromPlayerName,
    targetPlayerId: trade.targetPlayerId,
    offer: trade.offer,
    request: trade.request
  };
}
