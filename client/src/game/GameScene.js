import Phaser from "phaser";
import { RESOURCE_TYPES } from "@shared/game";
const TILE_SIZE = 32;
const MOVE_COOLDOWN_MS = 135;
export class GameScene extends Phaser.Scene {
    socket;
    hud;
    self = null;
    inventory = { wood: 0, stone: 0, iron: 0 };
    players = new Map();
    playerSprites = new Map();
    tileSprites = new Map();
    lastMoveAt = 0;
    facing = "down";
    cursors;
    keys;
    constructor(socket, hud) {
        super("game");
        this.socket = socket;
        this.hud = hud;
    }
    create() {
        if (!this.input.keyboard) {
            throw new Error("Keyboard input unavailable");
        }
        this.cameras.main.setBackgroundColor("#111827");
        this.cameras.main.setZoom(1.1);
        this.drawBaseGrid();
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys("W,A,S,D,SPACE");
        this.keys.w = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.keys.a = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.keys.s = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.keys.d = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        this.keys.space = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.keys.space.on("down", () => this.gatherFacingTile());
        this.registerSocketHandlers();
        this.joinWorld();
    }
    update(time) {
        const direction = this.readDirection();
        if (!direction || time - this.lastMoveAt < MOVE_COOLDOWN_MS) {
            return;
        }
        this.lastMoveAt = time;
        this.facing = direction;
        this.socket.emit("move", { direction }, (result) => {
            if (!result.ok) {
                this.hud.setMessage(result.error);
            }
        });
    }
    buildFacingTile(type) {
        const target = this.facingPosition();
        if (!target) {
            return;
        }
        this.socket.emit("build", { target, type }, (result) => {
            if (!result.ok) {
                this.hud.setMessage(result.error);
                return;
            }
            this.inventory = result.data.inventory;
            this.hud.setInventory(this.inventory);
            this.hud.setMessage(`Built ${type}`);
        });
    }
    sendTrade(input) {
        if (!input.targetPlayerId) {
            this.hud.setMessage("Trade target required");
            return;
        }
        this.socket.emit("trade:request", input, (result) => {
            this.hud.setMessage(result.ok ? `Trade sent ${result.data.id.slice(0, 8)}` : result.error);
        });
    }
    joinWorld() {
        const savedPlayerId = localStorage.getItem("playerId") ?? undefined;
        const savedName = localStorage.getItem("playerName") ?? undefined;
        const name = savedName ?? window.prompt("Guest name?", `Guest-${Math.floor(Math.random() * 9999)}`) ?? undefined;
        if (name) {
            localStorage.setItem("playerName", name);
        }
        this.socket.emit("join", { playerId: savedPlayerId, name }, (result) => {
            if (!result.ok) {
                this.hud.setMessage(result.error);
                return;
            }
            const { player, inventory, world } = result.data;
            this.self = player;
            this.inventory = inventory;
            localStorage.setItem("playerId", player.id);
            for (const chunk of world.chunks) {
                this.renderChunk(chunk);
            }
            for (const worldPlayer of world.players) {
                this.upsertPlayer(worldPlayer);
            }
            this.upsertPlayer(player);
            this.hud.setPlayer(player);
            this.hud.setInventory(inventory);
            this.updatePlayerHud();
            this.hud.setMessage("Connected");
        });
    }
    registerSocketHandlers() {
        this.socket.on("player:joined", (player) => {
            this.upsertPlayer(player);
            this.updatePlayerHud();
            this.hud.setMessage(`${player.name} joined`);
        });
        this.socket.on("player:left", (playerId) => {
            this.players.delete(playerId);
            this.playerSprites.get(playerId)?.destroy();
            this.playerSprites.delete(playerId);
            this.updatePlayerHud();
        });
        this.socket.on("player:moved", (player) => {
            this.upsertPlayer(player);
            if (this.self?.id === player.id) {
                this.self = player;
                this.hud.setPlayer(player);
            }
        });
        this.socket.on("inventory:update", (inventory) => {
            this.inventory = inventory;
            this.hud.setInventory(inventory);
        });
        this.socket.on("world:chunk", (chunk) => this.renderChunk(chunk));
        this.socket.on("world:tile", (tile) => this.renderTile(tile));
        this.socket.on("trade:request", (trade) => this.handleIncomingTrade(trade));
        this.socket.on("trade:closed", ({ tradeId, status }) => {
            this.hud.setMessage(`Trade ${tradeId.slice(0, 8)} ${status}`);
        });
        this.socket.on("event", (event) => {
            if (event.type === "resourceGathered") {
                this.hud.setMessage(`${event.playerId.slice(0, 8)} gathered ${event.resource}`);
            }
            if (event.type === "structureBuilt") {
                this.hud.setMessage(`${event.playerId.slice(0, 8)} built ${event.structure.type}`);
            }
            if (event.type === "tradeCompleted") {
                this.hud.setMessage(`Trade ${event.tradeId.slice(0, 8)} complete`);
            }
        });
        this.socket.on("error", (message) => this.hud.setMessage(message));
    }
    gatherFacingTile() {
        const target = this.facingPosition();
        if (!target) {
            return;
        }
        this.socket.emit("gather", { target }, (result) => {
            if (!result.ok) {
                this.hud.setMessage(result.error);
                return;
            }
            this.inventory = result.data.inventory;
            this.hud.setInventory(this.inventory);
            this.hud.setMessage(`Gathered ${result.data.resource.type}`);
        });
    }
    handleIncomingTrade(trade) {
        const accepted = window.confirm(`${trade.fromPlayerName} wants to trade.\nOffer: ${formatItems(trade.offer)}\nRequest: ${formatItems(trade.request)}`);
        this.socket.emit("trade:respond", { tradeId: trade.id, accept: accepted }, (result) => {
            if (!result.ok) {
                this.hud.setMessage(result.error);
                return;
            }
            this.inventory = result.data.inventory;
            this.hud.setInventory(this.inventory);
        });
    }
    renderChunk(chunk) {
        for (const tile of chunk.tiles) {
            this.renderTile(tile);
        }
    }
    renderTile(tile) {
        const key = positionKey(tile.position);
        this.tileSprites.get(key)?.destroy();
        this.tileSprites.delete(key);
        if (!tile.resource && !tile.structure) {
            return;
        }
        const container = this.add.container(worldX(tile.position.x), worldY(tile.position.y));
        if (tile.resource) {
            const color = tile.resource.amount > 0 ? resourceColor(tile.resource.type) : 0x4b5563;
            container.add(this.add.rectangle(0, 0, TILE_SIZE * 0.72, TILE_SIZE * 0.72, color).setStrokeStyle(1, 0x111827));
            container.add(this.add.text(-9, -8, String(tile.resource.amount), { color: "#ffffff", fontSize: "12px" }));
        }
        if (tile.structure) {
            container.add(this.add.rectangle(0, 0, TILE_SIZE * 0.92, TILE_SIZE * 0.92, structureColor(tile.structure.type)).setStrokeStyle(2, 0xf9fafb));
            container.add(this.add.text(-11, -8, structureGlyph(tile.structure.type), { color: "#111827", fontSize: "13px" }));
        }
        this.tileSprites.set(key, container);
    }
    upsertPlayer(player) {
        this.players.set(player.id, player);
        let sprite = this.playerSprites.get(player.id);
        if (!sprite) {
            sprite = this.add.container(worldX(player.position.x), worldY(player.position.y));
            const color = this.self?.id === player.id ? 0x22c55e : 0x60a5fa;
            sprite.add(this.add.circle(0, 0, TILE_SIZE * 0.35, color).setStrokeStyle(2, 0xf9fafb));
            sprite.add(this.add.text(-18, -26, player.name.slice(0, 10), { color: "#e5e7eb", fontSize: "11px" }));
            this.playerSprites.set(player.id, sprite);
        }
        this.tweens.add({
            targets: sprite,
            x: worldX(player.position.x),
            y: worldY(player.position.y),
            duration: 90,
            ease: "Sine.easeOut"
        });
        if (this.self?.id === player.id) {
            this.cameras.main.startFollow(sprite, true, 0.12, 0.12);
        }
    }
    updatePlayerHud() {
        this.hud.setPlayers([...this.players.values()]);
    }
    readDirection() {
        if (this.cursors.left?.isDown || this.keys.a.isDown) {
            return "left";
        }
        if (this.cursors.right?.isDown || this.keys.d.isDown) {
            return "right";
        }
        if (this.cursors.up?.isDown || this.keys.w.isDown) {
            return "up";
        }
        if (this.cursors.down?.isDown || this.keys.s.isDown) {
            return "down";
        }
        return null;
    }
    facingPosition() {
        if (!this.self) {
            return null;
        }
        const { x, y } = this.self.position;
        if (this.facing === "up") {
            return { x, y: y - 1 };
        }
        if (this.facing === "down") {
            return { x, y: y + 1 };
        }
        if (this.facing === "left") {
            return { x: x - 1, y };
        }
        return { x: x + 1, y };
    }
    drawBaseGrid() {
        const graphics = this.add.graphics();
        graphics.lineStyle(1, 0x233044, 0.8);
        const radius = 80;
        for (let x = -radius; x <= radius; x += 1) {
            graphics.lineBetween(worldX(x) - TILE_SIZE / 2, worldY(-radius) - TILE_SIZE / 2, worldX(x) - TILE_SIZE / 2, worldY(radius) + TILE_SIZE / 2);
        }
        for (let y = -radius; y <= radius; y += 1) {
            graphics.lineBetween(worldX(-radius) - TILE_SIZE / 2, worldY(y) - TILE_SIZE / 2, worldX(radius) + TILE_SIZE / 2, worldY(y) - TILE_SIZE / 2);
        }
    }
}
function worldX(x) {
    return x * TILE_SIZE;
}
function worldY(y) {
    return y * TILE_SIZE;
}
function positionKey(position) {
    return `${position.x}:${position.y}`;
}
function resourceColor(type) {
    if (type === "wood") {
        return 0x16a34a;
    }
    if (type === "stone") {
        return 0x94a3b8;
    }
    return 0xf97316;
}
function structureColor(type) {
    if (type === "wall") {
        return 0x9ca3af;
    }
    if (type === "storage") {
        return 0xf59e0b;
    }
    return 0xa78bfa;
}
function structureGlyph(type) {
    if (type === "wall") {
        return "W";
    }
    if (type === "storage") {
        return "S";
    }
    return "C";
}
function formatItems(items) {
    return RESOURCE_TYPES.map((type) => `${type}:${items[type] ?? 0}`).join(" ");
}
