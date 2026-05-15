import Phaser from "phaser";
import { createGameConfig } from "./game/MobaScene";
import { initHud } from "./ui/hud";
import "./styles.css";

const loadingShell = document.querySelector<HTMLElement>("#loading-shell");
const loadingBar = document.querySelector<HTMLElement>("#loading-progress-bar");
const loadingPercent = document.querySelector<HTMLElement>("#loading-percent");
const loadingStatus = document.querySelector<HTMLElement>("#loading-status");

const setLoadingProgress = (progress: number) => {
  const percent = Math.min(100, Math.max(0, Math.round(progress)));
  if (loadingBar) loadingBar.style.width = `${Math.max(8, percent)}%`;
  if (loadingPercent) loadingPercent.textContent = `${percent}%`;
};

const setLoadingStatus = (status: string, failed = false) => {
  if (!loadingStatus) return;
  loadingStatus.textContent = status;
  loadingStatus.classList.toggle("is-error", failed);
};

window.addEventListener("mini-lol:loading-progress", (event) => {
  const progress = (event as CustomEvent<{ progress: number }>).detail?.progress ?? 0;
  setLoadingProgress(progress);
});

window.addEventListener("mini-lol:loading-file", (event) => {
  const file = (event as CustomEvent<{ file: string }>).detail?.file;
  if (file) setLoadingStatus(`正在加载 ${file}`);
});

window.addEventListener("mini-lol:loading-error", (event) => {
  const file = (event as CustomEvent<{ file: string }>).detail?.file ?? "未知资源";
  setLoadingStatus(`资源加载失败：${file}。请刷新或检查部署产物。`, true);
});

window.addEventListener("mini-lol:ready", () => {
  setLoadingProgress(100);
  setLoadingStatus("战场准备完成");
  loadingShell?.classList.add("is-hidden");
});

setLoadingProgress(0);
initHud();

const game = new Phaser.Game(createGameConfig());

window.addEventListener("beforeunload", () => {
  game.destroy(true);
});
