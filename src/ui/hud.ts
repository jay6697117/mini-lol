import { UI_ICON_URLS } from "../game/assets";
import type { BuildingSnapshot, GameSnapshot, UnitSnapshot } from "../game/types";

const query = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing HUD element: ${selector}`);
  return element;
};

const percent = (value: number, max: number) => `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
const cooldownText = (seconds: number) => (seconds > 0 ? seconds.toFixed(1) : "");

const icon = (src: string, label: string) => `<img src="${src}" alt="${label}" />`;

export const initHud = () => {
  const root = document.querySelector("#hud-root");
  if (!root) throw new Error("HUD root is missing");

  root.innerHTML = `
    <section class="scoreboard" aria-label="Match status">
      <div class="team-score azure">Azure <strong data-score-azure>0</strong></div>
      <div class="timer" data-time>00:00</div>
      <div class="team-score crimson"><strong data-score-crimson>0</strong> Crimson</div>
    </section>

    <section class="combat-readout" aria-label="Player status">
      <div class="portrait-frame"></div>
      <div class="bars">
        <div class="bar health"><span data-health-bar></span><em data-health-text></em></div>
        <div class="bar mana"><span data-mana-bar></span><em data-mana-text></em></div>
        <div class="stat-row">
          <span class="stat-pill">${icon(UI_ICON_URLS.status.level_up, "Level")}<strong data-level>1</strong></span>
          <span class="stat-pill">${icon(UI_ICON_URLS.status.gold, "Gold")}<strong data-gold>842</strong></span>
          <span class="stat-pill">${icon(UI_ICON_URLS.status.skill_point, "XP")}<strong data-xp>0</strong></span>
          <span class="stat-pill text-stat">CS <strong data-last-hits>0</strong></span>
          <span class="stat-pill text-stat">SP <strong data-skill-points>0</strong></span>
          <span class="stat-pill text-stat">W <strong data-wave>1</strong></span>
        </div>
        <div class="recall-bar" data-recall-wrap hidden><span data-recall-bar></span><em data-recall-text></em></div>
      </div>
    </section>

    <section class="objective-panel" aria-label="Objectives">
      <div data-building-list></div>
    </section>

    <section class="minimap" aria-label="Minimap">
      <div class="minimap-lane"></div>
      <div data-minimap-dots></div>
    </section>

    <section class="ability-dock" aria-label="Abilities">
      ${(["q", "w", "e", "r"] as const)
        .map((skill) => {
          const src = UI_ICON_URLS.skills[`astra_${skill}`];
          return `
            <div class="ability-cell ${skill === "r" ? "ultimate-cell" : ""}">
              <button class="ability ${skill === "r" ? "ultimate" : ""}" data-skill="${skill}">${icon(src, skill.toUpperCase())}<span>${skill.toUpperCase()}</span><strong data-skill-rank="${skill}">${skill === "r" ? 0 : 1}</strong><em data-cooldown="${skill}"></em></button>
              <button class="skill-upgrade" data-upgrade="${skill}" aria-label="Upgrade ${skill.toUpperCase()}">+</button>
            </div>
          `;
        })
        .join("")}
      <button class="recall-button" data-recall title="Recall">${icon(UI_ICON_URLS.status.recall, "Recall")}<span>B</span></button>
    </section>

    <section class="item-dock" aria-label="Items">
      ${Object.entries(UI_ICON_URLS.items)
        .map(([name, src]) => `<button class="item-slot" data-item="${name}" title="${name}">${icon(src, name)}</button>`)
        .join("")}
    </section>

    <section class="status-chip" data-message>Lane phase</section>
    <section class="result-banner" data-result hidden>
      <strong data-result-title></strong>
      <span data-result-subtitle></span>
    </section>
  `;

  root.addEventListener("click", (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const item = element?.closest<HTMLButtonElement>("[data-item]");
    if (item?.dataset.item) {
      window.miniLolDebug?.buyItem(item.dataset.item as Parameters<NonNullable<typeof window.miniLolDebug>["buyItem"]>[0]);
      return;
    }
    const upgrade = element?.closest<HTMLButtonElement>("[data-upgrade]");
    const upgradeKey = upgrade?.dataset.upgrade;
    if (upgradeKey === "q" || upgradeKey === "w" || upgradeKey === "e" || upgradeKey === "r") {
      window.miniLolDebug?.upgradeSkill(upgradeKey);
      return;
    }
    if (element?.closest("[data-recall]")) {
      window.miniLolDebug?.startRecall();
      return;
    }
    const skill = element?.closest<HTMLButtonElement>("[data-skill]");
    const skillKey = skill?.dataset.skill;
    if (skillKey === "q" || skillKey === "w" || skillKey === "e" || skillKey === "r") window.miniLolDebug?.castSkill(skillKey);
  });
};

export const updateHud = (snapshot: GameSnapshot) => {
  if (!document.querySelector("#hud-root .scoreboard")) initHud();

  query<HTMLElement>("[data-score-azure]").textContent = String(snapshot.score.azureKills);
  query<HTMLElement>("[data-score-crimson]").textContent = String(snapshot.score.crimsonKills);
  query<HTMLElement>("[data-time]").textContent = formatTime(snapshot.time);
  query<HTMLElement>("[data-health-bar]").style.width = percent(snapshot.player.hp, snapshot.player.maxHp);
  query<HTMLElement>("[data-mana-bar]").style.width = percent(snapshot.player.mana, snapshot.player.maxMana);
  query<HTMLElement>("[data-health-text]").textContent = `${snapshot.player.hp} / ${snapshot.player.maxHp}`;
  query<HTMLElement>("[data-mana-text]").textContent = `${snapshot.player.mana} / ${snapshot.player.maxMana}`;
  query<HTMLElement>("[data-level]").textContent = String(snapshot.player.level);
  query<HTMLElement>("[data-gold]").textContent = String(snapshot.player.gold);
  query<HTMLElement>("[data-xp]").textContent = String(snapshot.player.xp);
  query<HTMLElement>("[data-last-hits]").textContent = String(snapshot.player.lastHits);
  query<HTMLElement>("[data-skill-points]").textContent = String(snapshot.player.skillPoints);
  query<HTMLElement>("[data-wave]").textContent = String(snapshot.lane.waveNumber);
  query<HTMLElement>("[data-message]").textContent = `${snapshot.message} · AI ${snapshot.enemyAi.state}`;
  const recallWrap = query<HTMLElement>("[data-recall-wrap]");
  recallWrap.hidden = !snapshot.player.recalling;
  query<HTMLElement>("[data-recall-bar]").style.width = `${Math.round(snapshot.player.recallProgress * 100)}%`;
  query<HTMLElement>("[data-recall-text]").textContent = snapshot.player.recalling ? "Recalling" : "";

  for (const skill of ["q", "w", "e", "r"] as const) {
    const cooldown = snapshot.cooldowns[skill];
    query<HTMLElement>(`[data-cooldown="${skill}"]`).textContent = cooldownText(cooldown);
    query<HTMLElement>(`[data-skill-rank="${skill}"]`).textContent = String(snapshot.skills[skill].level);
    const button = query<HTMLButtonElement>(`[data-skill="${skill}"]`);
    const upgradeButton = query<HTMLButtonElement>(`[data-upgrade="${skill}"]`);
    button.classList.toggle("cooling", cooldown > 0);
    button.classList.toggle("locked", !snapshot.skills[skill].canCast && snapshot.skills[skill].level <= 0);
    button.classList.toggle("upgradeable", snapshot.skills[skill].canUpgrade);
    upgradeButton.hidden = !snapshot.skills[skill].canUpgrade;
    upgradeButton.disabled = !snapshot.skills[skill].canUpgrade;
  }

  const recallButton = query<HTMLButtonElement>("[data-recall]");
  recallButton.classList.toggle("channeling", snapshot.player.recalling);

  renderBuildings(snapshot.buildings);
  renderMinimap(snapshot.units, snapshot.buildings);
  renderItems(snapshot);
  renderResult(snapshot);
};

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
};

const renderBuildings = (buildings: BuildingSnapshot[]) => {
  const container = query<HTMLElement>("[data-building-list]");
  container.innerHTML = buildings
    .map((building) => {
      const ratio = percent(building.hp, building.maxHp);
      return `
        <div class="objective-row ${building.team}">
          <span>${building.id.split("_").join(" ")}</span>
          <div class="objective-bar"><i style="width: ${ratio}"></i></div>
          <em>${building.state}</em>
        </div>
      `;
    })
    .join("");
};

const renderMinimap = (units: UnitSnapshot[], buildings: BuildingSnapshot[]) => {
  const container = query<HTMLElement>("[data-minimap-dots]");
  const dots: string[] = [];
  for (const building of buildings) {
    const src = building.id.includes("tower")
      ? building.team === "azure"
        ? UI_ICON_URLS.minimap.azure_tower
        : UI_ICON_URLS.minimap.crimson_tower
      : building.team === "azure"
        ? UI_ICON_URLS.minimap.azure_core
        : UI_ICON_URLS.minimap.crimson_core;
    const position = minimapPosition(building.id);
    dots.push(`<img class="map-dot building" src="${src}" alt="${building.id}" style="left:${position.x}%; top:${position.y}%;" />`);
  }

  for (const unit of units.slice(0, 20)) {
    const src =
      unit.kind === "hero"
        ? unit.team === "azure"
          ? UI_ICON_URLS.minimap.azure_hero
          : UI_ICON_URLS.minimap.crimson_hero
        : unit.team === "azure"
          ? UI_ICON_URLS.minimap.azure_minion
          : UI_ICON_URLS.minimap.crimson_minion;
    dots.push(`<img class="map-dot" src="${src}" alt="${unit.id}" style="left:${(unit.x / 1600) * 100}%; top:${(unit.y / 900) * 100}%;" />`);
  }
  container.innerHTML = dots.join("");
};

const renderItems = (snapshot: GameSnapshot) => {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-item]")) {
    const itemId = button.dataset.item ?? "";
    const purchased = snapshot.player.items.includes(itemId);
    button.classList.toggle("purchased", purchased);
    button.disabled = purchased || !snapshot.player.shopAvailable;
  }
};

const minimapPosition = (id: string) => {
  const positions: Record<string, { x: number; y: number }> = {
    azure_outer_tower: { x: 26, y: 67 },
    crimson_outer_tower: { x: 74, y: 37 },
    azure_core: { x: 11, y: 78 },
    crimson_core: { x: 89, y: 23 },
  };
  return positions[id] ?? { x: 50, y: 50 };
};

const renderResult = (snapshot: GameSnapshot) => {
  const banner = query<HTMLElement>("[data-result]");
  if (snapshot.mode === "playing") {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  query<HTMLElement>("[data-result-title]").textContent = snapshot.mode === "victory" ? "Victory" : "Defeat";
  query<HTMLElement>("[data-result-subtitle]").textContent = snapshot.message;
};
