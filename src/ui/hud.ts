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

let lastShopSignature = "";
let lastScoreboardSignature = "";

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

    <button class="settings-button" data-settings-toggle title="Settings">Esc</button>

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
      <button class="shop-button" data-shop-toggle title="Shop">${icon(UI_ICON_URLS.status.shop, "Shop")}<span>Shop</span></button>
      ${Object.entries(UI_ICON_URLS.items)
        .map(([name, src]) => `<button class="item-slot" data-item="${name}" title="${name}">${icon(src, name)}<span data-item-key="${name}"></span><em data-item-cooldown="${name}"></em></button>`)
        .join("")}
    </section>

    <section class="shop-panel" data-shop-panel hidden aria-label="Base shop">
      <div class="panel-header">
        <strong>Base Shop</strong>
        <button class="panel-close" data-shop-close aria-label="Close shop">x</button>
      </div>
      <div class="shop-status" data-shop-status></div>
      <div class="shop-grid" data-shop-items></div>
    </section>

    <section class="scoreboard-panel" data-scoreboard-panel hidden aria-label="Scoreboard">
      <div class="panel-header">
        <strong>Scoreboard</strong>
        <button class="panel-close" data-scoreboard-close aria-label="Close scoreboard">x</button>
      </div>
      <div class="scoreboard-table" data-scoreboard-rows></div>
    </section>

    <section class="settings-panel" data-settings-panel hidden aria-label="Settings">
      <div class="panel-header">
        <strong>Settings</strong>
        <button class="panel-close" data-settings-close aria-label="Close settings">x</button>
      </div>
      <div class="settings-list">
        <button class="setting-toggle" data-setting="quickCast"><span>Quick Cast</span><strong data-setting-value="quickCast"></strong></button>
        <button class="setting-toggle" data-setting="rangeIndicators"><span>Range Indicators</span><strong data-setting-value="rangeIndicators"></strong></button>
        <div class="setting-row"><span>Shop</span><strong>P</strong></div>
        <div class="setting-row"><span>Item Actives</span><strong>1-4</strong></div>
      </div>
    </section>

    <section class="death-overlay" data-death-overlay hidden aria-label="Respawn status">
      <strong>Respawning</strong>
      <span data-death-countdown></span>
      <em data-death-blocked></em>
      <div class="death-bar"><i data-death-progress></i></div>
    </section>

    <section class="status-chip" data-message>Lane phase</section>
    <section class="result-banner" data-result hidden>
      <strong data-result-title></strong>
      <span data-result-subtitle></span>
      <div class="result-summary" data-result-summary></div>
    </section>
  `;

  root.addEventListener("click", (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const item = element?.closest<HTMLButtonElement>("[data-item]");
    if (item?.dataset.item) {
      window.miniLolDebug?.itemSlotAction(item.dataset.item as Parameters<NonNullable<typeof window.miniLolDebug>["itemSlotAction"]>[0]);
      return;
    }
    const shopBuy = element?.closest<HTMLButtonElement>("[data-shop-buy]");
    if (shopBuy?.dataset.shopBuy) {
      window.miniLolDebug?.buyItem(shopBuy.dataset.shopBuy as Parameters<NonNullable<typeof window.miniLolDebug>["buyItem"]>[0]);
      return;
    }
    if (element?.closest("[data-shop-toggle]")) {
      window.miniLolDebug?.toggleShop();
      return;
    }
    if (element?.closest("[data-shop-close]")) {
      window.miniLolDebug?.setShopOpen(false);
      return;
    }
    if (element?.closest("[data-scoreboard-close]")) {
      window.miniLolDebug?.setScoreboardOpen(false);
      return;
    }
    if (element?.closest("[data-settings-toggle]")) {
      window.miniLolDebug?.toggleSettings();
      return;
    }
    if (element?.closest("[data-settings-close]")) {
      window.miniLolDebug?.setSettingsOpen(false);
      return;
    }
    const setting = element?.closest<HTMLButtonElement>("[data-setting]");
    if (setting?.dataset.setting === "quickCast") {
      const enabled = window.miniLolDebug?.snapshot().settings.quickCast ?? true;
      window.miniLolDebug?.setQuickCast(!enabled);
      return;
    }
    if (setting?.dataset.setting === "rangeIndicators") {
      const enabled = window.miniLolDebug?.snapshot().settings.showRangeIndicators ?? true;
      window.miniLolDebug?.setRangeIndicators(!enabled);
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
  const castState = snapshot.casting.queuedSkill
    ? ` · ${snapshot.casting.queuedSkill.toUpperCase()} queued`
    : snapshot.casting.locked && snapshot.casting.activeSkill
      ? ` · Casting ${snapshot.casting.activeSkill.toUpperCase()}`
      : "";
  query<HTMLElement>("[data-message]").textContent = `${snapshot.message}${castState} · AI ${snapshot.enemyAi.state}`;
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
    button.classList.toggle("queued", snapshot.skills[skill].queued);
    button.disabled = !snapshot.player.alive || (snapshot.skills[skill].level <= 0 && !snapshot.skills[skill].canUpgrade);
    upgradeButton.hidden = !snapshot.skills[skill].canUpgrade;
    upgradeButton.disabled = !snapshot.skills[skill].canUpgrade;
  }

  const recallButton = query<HTMLButtonElement>("[data-recall]");
  recallButton.classList.toggle("channeling", snapshot.player.recalling);
  recallButton.disabled = !snapshot.player.alive;

  renderBuildings(snapshot.buildings);
  renderMinimap(snapshot.units, snapshot.buildings);
  renderItems(snapshot);
  renderShop(snapshot);
  renderScoreboard(snapshot);
  renderSettings(snapshot);
  renderDeath(snapshot);
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
  const shopItems = new Map(snapshot.shop.items.map((item) => [item.id, item]));
  const activeItems = new Map(snapshot.itemSlots.map((item) => [item.id, item]));
  const shopButton = query<HTMLButtonElement>("[data-shop-toggle]");
  shopButton.classList.toggle("available", snapshot.shop.available);
  shopButton.classList.toggle("open", snapshot.shop.open);
  shopButton.disabled = !snapshot.player.alive || snapshot.settings.open;
  query<HTMLButtonElement>("[data-settings-toggle]").classList.toggle("open", snapshot.settings.open);
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-item]")) {
    const itemId = button.dataset.item ?? "";
    const item = shopItems.get(itemId);
    const activeItem = activeItems.get(itemId);
    const purchased = snapshot.player.items.includes(itemId);
    const cooldown = activeItem?.cooldown ?? item?.cooldown ?? 0;
    button.classList.toggle("purchased", purchased);
    button.classList.toggle("active-ready", Boolean(purchased && activeItem?.canUse));
    button.classList.toggle("cooling", cooldown > 0);
    button.classList.toggle("active-item", Boolean(activeItem));
    button.disabled = purchased
      ? !activeItem?.canUse
      : !snapshot.player.shopAvailable || !item?.affordable || !snapshot.player.alive || snapshot.settings.open || snapshot.scoreboard.open;
    const key = button.querySelector<HTMLElement>("[data-item-key]");
    if (key) key.textContent = activeItem?.slot ? String(activeItem.slot) : "";
    const overlay = button.querySelector<HTMLElement>("[data-item-cooldown]");
    if (overlay) overlay.textContent = cooldown > 0 ? cooldown.toFixed(1) : "";
  }
};

const renderShop = (snapshot: GameSnapshot) => {
  const panel = query<HTMLElement>("[data-shop-panel]");
  panel.hidden = !snapshot.shop.open;
  if (!snapshot.shop.open) {
    lastShopSignature = "";
    return;
  }

  query<HTMLElement>("[data-shop-status]").textContent = snapshot.shop.available ? `${snapshot.player.gold}g available` : "Return to base";
  const signature = JSON.stringify({
    gold: snapshot.player.gold,
    available: snapshot.shop.available,
    items: snapshot.shop.items,
  });
  if (signature === lastShopSignature) return;
  lastShopSignature = signature;
  query<HTMLElement>("[data-shop-items]").innerHTML = snapshot.shop.items
    .map((item) => {
      const src = UI_ICON_URLS.items[item.id as keyof typeof UI_ICON_URLS.items];
      const disabled = item.owned || !item.available || !item.affordable;
      const state = item.owned ? "Owned" : item.affordable ? `${item.cost}g` : `Need ${item.cost - snapshot.player.gold}g`;
      return `
        <article class="shop-item ${item.owned ? "owned" : ""} ${!item.affordable ? "locked" : ""}">
          ${icon(src, item.name)}
          <div>
            <strong>${item.name}</strong>
            <span>${item.stats}${item.activeLabel ? ` · ${item.activeLabel} [${item.slot}]` : ""}</span>
          </div>
          <button data-shop-buy="${item.id}" ${disabled ? "disabled" : ""}>${state}</button>
        </article>
      `;
    })
    .join("");
};

const renderScoreboard = (snapshot: GameSnapshot) => {
  const panel = query<HTMLElement>("[data-scoreboard-panel]");
  panel.hidden = !snapshot.scoreboard.open;
  if (!snapshot.scoreboard.open) {
    lastScoreboardSignature = "";
    return;
  }

  const signature = JSON.stringify(snapshot.scoreboard.rows);
  if (signature === lastScoreboardSignature) return;
  lastScoreboardSignature = signature;
  query<HTMLElement>("[data-scoreboard-rows]").innerHTML = snapshot.scoreboard.rows
    .map((row) => {
      const itemIcons = row.items.length
        ? row.items
            .map((itemId) => {
              const src = UI_ICON_URLS.items[itemId as keyof typeof UI_ICON_URLS.items];
              return `<img src="${src}" alt="${itemId}" />`;
            })
            .join("")
        : `<span class="empty-items">Empty</span>`;
      return `
        <div class="scoreboard-row ${row.team}">
          <strong>${row.name}</strong>
          <span>Lv ${row.level}</span>
          <span>${row.kills} / ${row.deaths}</span>
          <span>${row.lastHits} CS</span>
          <span>${row.gold}g</span>
          <span class="row-state">${row.alive ? "Alive" : `${row.respawnTimer}s`}</span>
          <div class="row-items">${itemIcons}</div>
        </div>
      `;
    })
    .join("");
};

const renderSettings = (snapshot: GameSnapshot) => {
  const panel = query<HTMLElement>("[data-settings-panel]");
  panel.hidden = !snapshot.settings.open;
  query<HTMLElement>('[data-setting-value="quickCast"]').textContent = snapshot.settings.quickCast ? "On" : "Off";
  query<HTMLElement>('[data-setting-value="rangeIndicators"]').textContent = snapshot.settings.showRangeIndicators ? "On" : "Off";
};

const renderDeath = (snapshot: GameSnapshot) => {
  const overlay = query<HTMLElement>("[data-death-overlay]");
  overlay.hidden = snapshot.player.alive;
  if (snapshot.player.alive) return;
  query<HTMLElement>("[data-death-countdown]").textContent = `${snapshot.player.deathTimer.toFixed(1)}s`;
  query<HTMLElement>("[data-death-blocked]").textContent = snapshot.controls.reason;
  query<HTMLElement>("[data-death-progress]").style.width = `${Math.round(snapshot.player.respawnProgress * 100)}%`;
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
  const summary = snapshot.matchSummary;
  query<HTMLElement>("[data-result-summary]").innerHTML = summary
    ? `
      <span>${formatTime(summary.duration)}</span>
      <span>KDA ${summary.player.kills} / ${summary.player.deaths}</span>
      <span>${summary.player.lastHits} CS</span>
      <span>${summary.player.items.length} Items</span>
      <span>Enemy ${summary.enemy.kills} / ${summary.enemy.deaths}</span>
    `
    : "";
};
