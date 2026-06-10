import Phaser from "phaser";
import { GameScene } from "./game/GameScene";
import { createGameSocket } from "./net/socket";
import { createHud } from "./ui/hud";
import "./style.css";
const socket = createGameSocket();
let scene = null;
const hud = createHud({
    onBuild(type) {
        scene?.buildFacingTile(type);
    },
    onTrade(input) {
        scene?.sendTrade(input);
    }
});
scene = new GameScene(socket, hud);
new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: window.innerWidth,
    height: window.innerHeight,
    pixelArt: true,
    scene,
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
});
