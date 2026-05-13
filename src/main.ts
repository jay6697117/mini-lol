import Phaser from "phaser";
import { createGameConfig } from "./game/MobaScene";
import { initHud } from "./ui/hud";
import "./styles.css";

initHud();

const game = new Phaser.Game(createGameConfig());

window.addEventListener("beforeunload", () => {
  game.destroy(true);
});
