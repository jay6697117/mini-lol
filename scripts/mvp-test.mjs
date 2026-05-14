import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 4173;
const URL = `http://127.0.0.1:${PORT}/`;
const outputDir = path.resolve("playtest-artifacts/mvp");
fs.mkdirSync(outputDir, { recursive: true });

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const waitForServer = async (url, timeoutMs = 15000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await canConnect(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Preview server did not become ready: ${url}`);
};

const canConnect = (url) =>
  new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode !== undefined && response.statusCode < 500);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });

const preview = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
});

let previewOutput = "";
preview.stdout.on("data", (chunk) => {
  previewOutput += chunk.toString();
});
preview.stderr.on("data", (chunk) => {
  previewOutput += chunk.toString();
});

const stopPreview = async () => {
  if (preview.exitCode !== null) return;
  preview.kill("SIGTERM");
  await new Promise((resolve) => preview.once("exit", resolve));
};

let browser;
try {
  await waitForServer(URL);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const snapshot = () =>
    page.evaluate(() => {
      const api = window.miniLolDebug;
      if (!api) throw new Error("miniLolDebug is not ready");
      return api.snapshot();
    });

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.miniLolDebug?.snapshot && window.miniLolCommands?.dispatch));

  let state = await snapshot();
  assert(state.mode === "playing", `initial mode should be playing, got ${state.mode}`);
  assert(state.units.some((unit) => unit.kind === "hero" && unit.team === "azure"), "player hero should be present");
  assert(state.buildings.some((building) => building.id === "crimson_inhibitor" && building.type === "inhibitor"), "crimson inhibitor should be present");
  assert(await page.locator("[data-first-run-panel]").isVisible(), "first-run guidance panel should be visible early");

  await page.evaluate(() => {
    window.miniLolDebug.setPlayerPosition(175, 705);
    window.miniLolCommands.dispatch({ type: "setShopOpen", open: true });
  });
  await page.waitForSelector("[data-shop-panel]:not([hidden])");
  assert(await page.locator(".shop-item.recommended").count() >= 1, "shop should mark a recommended item");
  await page.click('[data-shop-buy="bronze_sword"]');
  state = await snapshot();
  assert(state.player.items.includes("bronze_sword"), "HUD shop click should buy through GameCommand dispatcher");

  await page.evaluate(() => {
    window.miniLolDebug.destroyEnemyTower();
    window.miniLolDebug.damageEnemyInhibitor(9999);
    window.miniLolDebug.forceWave();
  });
  state = await snapshot();
  assert(state.buildings.find((building) => building.id === "crimson_inhibitor")?.hp === 0, "crimson inhibitor should be destroyed");
  assert(state.units.some((unit) => unit.team === "azure" && unit.kind === "super"), "destroyed crimson inhibitor should add azure super minions to new waves");
  assert(state.message.includes("Super"), `super wave message should be visible, got ${state.message}`);

  await page.screenshot({ path: path.join(outputDir, "mvp-state.png"), fullPage: true });

  await page.evaluate(() => window.miniLolDebug.damageEnemyCore(9999));
  state = await snapshot();
  assert(state.mode === "victory", `destroyed exposed crimson core should end in victory, got ${state.mode}`);
  assert(state.matchSummary?.objectives.crimsonInhibitorDestroyed === true, "match summary should include destroyed crimson inhibitor");

  const report = {
    ok: failures.length === 0,
    failures,
    final: {
      mode: state.mode,
      playerItems: state.player.items,
      buildings: state.buildings.map((building) => ({ id: building.id, type: building.type, hp: building.hp })),
      superMinions: state.units.filter((unit) => unit.kind === "super").length,
      matchSummary: state.matchSummary,
    },
  };
  fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  if (failures.length > 0) {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  }
} catch (error) {
  const report = {
    ok: false,
    failures: [...failures, error instanceof Error ? error.message : String(error)],
    previewOutput,
  };
  fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await stopPreview();
}
