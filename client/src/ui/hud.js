import { RESOURCE_TYPES, STRUCTURE_TYPES } from "@shared/game";
export function createHud(callbacks) {
    const root = document.querySelector("#hud");
    if (!root) {
        throw new Error("HUD root not found");
    }
    root.innerHTML = `
    <h2>Shared World</h2>
    <div class="muted">Move: WASD/arrows. Gather: Space.</div>
    <section>
      <h3>Player</h3>
      <div id="hud-player"></div>
    </section>
    <section>
      <h3>Inventory</h3>
      <div id="hud-inventory" class="hud-grid"></div>
    </section>
    <section>
      <h3>Build</h3>
      <div id="hud-build" class="hud-grid"></div>
      <div class="muted">Build places on tile facing current aim.</div>
    </section>
    <section>
      <h3>Online</h3>
      <div id="hud-players" class="muted"></div>
    </section>
    <section>
      <h3>Trade</h3>
      <input id="trade-target" placeholder="target player id" />
      <div class="muted">Offer</div>
      <div id="trade-offer" class="hud-grid"></div>
      <div class="muted">Request</div>
      <div id="trade-request" class="hud-grid"></div>
      <button id="trade-send">Send trade</button>
    </section>
    <div id="hud-log" class="log"></div>
  `;
    const playerEl = must("#hud-player");
    const inventoryEl = must("#hud-inventory");
    const buildEl = must("#hud-build");
    const playersEl = must("#hud-players");
    const logEl = must("#hud-log");
    const offerEl = must("#trade-offer");
    const requestEl = must("#trade-request");
    const targetEl = must("#trade-target");
    const sendTradeEl = must("#trade-send");
    buildEl.innerHTML = "";
    for (const type of STRUCTURE_TYPES) {
        const button = document.createElement("button");
        button.textContent = labelForStructure(type);
        button.addEventListener("click", () => callbacks.onBuild(type));
        buildEl.appendChild(button);
    }
    createItemInputs(offerEl, "offer");
    createItemInputs(requestEl, "request");
    sendTradeEl.addEventListener("click", () => {
        callbacks.onTrade({
            targetPlayerId: targetEl.value.trim(),
            offer: readItems("offer"),
            request: readItems("request")
        });
    });
    return {
        setPlayer(player) {
            playerEl.innerHTML = `
        <div><strong>${escapeHtml(player.name)}</strong></div>
        <div class="muted">id: ${player.id}</div>
        <div>coords: ${player.position.x}, ${player.position.y}</div>
      `;
        },
        setInventory(inventory) {
            inventoryEl.innerHTML = RESOURCE_TYPES.map((type) => `<div>${type}: <strong>${inventory[type]}</strong></div>`).join("");
        },
        setPlayers(players) {
            playersEl.innerHTML = players
                .map((player) => `${escapeHtml(player.name)} <span class="muted">${player.id.slice(0, 8)}</span>`)
                .join("<br />");
        },
        setMessage(message) {
            logEl.textContent = message;
        }
    };
}
function createItemInputs(root, prefix) {
    root.innerHTML = "";
    for (const type of RESOURCE_TYPES) {
        const input = document.createElement("input");
        input.id = `${prefix}-${type}`;
        input.type = "number";
        input.min = "0";
        input.step = "1";
        input.placeholder = type;
        root.appendChild(input);
    }
}
function readItems(prefix) {
    const items = {};
    for (const type of RESOURCE_TYPES) {
        const value = Number(must(`#${prefix}-${type}`).value || 0);
        items[type] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    }
    return items;
}
function labelForStructure(type) {
    return type === "craftingStation" ? "Crafting" : type[0].toUpperCase() + type.slice(1);
}
function must(selector) {
    const el = document.querySelector(selector);
    if (!el) {
        throw new Error(`Missing HUD element ${selector}`);
    }
    return el;
}
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };
        return replacements[char];
    });
}
