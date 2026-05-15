import { UI_ICON_URLS } from "../game/assets";
import { dispatchGameCommand } from "../game/game-command";
import type { ItemId } from "../game/data/game-config";
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

const ENEMY_OBJECTIVE_ORDER = ["crimson_outer_tower", "crimson_inhibitor", "crimson_core"] as const;
const ALLIED_OBJECTIVE_ORDER = ["azure_outer_tower", "azure_inhibitor", "azure_core"] as const;

const TEAM_LABELS: Record<BuildingSnapshot["team"], string> = {
  azure: "蓝方",
  crimson: "红方",
};

const UNIT_KIND_LABELS: Record<UnitSnapshot["kind"], string> = {
  hero: "英雄",
  melee: "近战兵",
  caster: "远程兵",
  siege: "攻城兵",
  super: "超级兵",
};

const BUILDING_LABELS: Record<string, string> = {
  azure_outer_tower: "蓝方外塔",
  crimson_outer_tower: "红方外塔",
  azure_inhibitor: "蓝方兵营",
  crimson_inhibitor: "红方兵营",
  azure_core: "蓝方核心",
  crimson_core: "红方核心",
};

const ITEM_LABELS: Record<ItemId, string> = {
  bronze_sword: "青铜长剑",
  plated_boots: "镀甲战靴",
  focus_crystal: "凝神水晶",
  guard_shield: "守卫盾",
  rift_lens: "裂隙透镜",
  vitality_core: "活力核心",
  haste_talisman: "迅捷护符",
  siege_hammer: "攻城战锤",
};

const ITEM_STATS: Record<ItemId, string> = {
  bronze_sword: "+18 攻击力",
  plated_boots: "+35 移速",
  focus_crystal: "+180 法力",
  guard_shield: "+140 生命",
  rift_lens: "+120 法力，+8% 技能急速",
  vitality_core: "+240 生命，+8 攻击",
  haste_talisman: "+12 攻击，+12 移速，+8% 技能急速",
  siege_hammer: "+28 攻击力",
};

const ACTIVE_LABELS: Record<string, string> = {
  Clarity: "清醒",
  Barrier: "屏障",
  Tempo: "疾步",
  Demolish: "破城",
};

const RAW_ITEM_LABELS: Record<string, string> = {
  "Bronze Sword": ITEM_LABELS.bronze_sword,
  "Plated Boots": ITEM_LABELS.plated_boots,
  "Focus Crystal": ITEM_LABELS.focus_crystal,
  "Guard Shield": ITEM_LABELS.guard_shield,
  "Rift Lens": ITEM_LABELS.rift_lens,
  "Vitality Core": ITEM_LABELS.vitality_core,
  "Haste Talisman": ITEM_LABELS.haste_talisman,
  "Siege Hammer": ITEM_LABELS.siege_hammer,
};

const AI_STATE_LABELS: Record<GameSnapshot["enemyAi"]["state"], string> = {
  Laning: "对线",
  Harass: "消耗",
  Retreat: "撤退",
  "All In": "强打",
  Recall: "回城",
};

const MESSAGE_LABELS: Record<string, string> = {
  "Lane phase": "对线阶段",
  "Recall complete": "回城完成",
  "Crimson recalled": "红方已回城",
  "Cast buffer cancelled": "施法缓存已取消",
  "Cast buffer expired": "施法缓存已过期",
  "Quick Cast enabled": "快速施法已开启",
  "Normal Cast enabled": "普通施法已开启",
  "Range indicators enabled": "范围指示已开启",
  "Range indicators hidden": "范围指示已隐藏",
  "Too close to enemies": "距离敌人过近",
  Recalling: "正在回城",
  "Crimson recall": "红方回城中",
  "Recall interrupted": "回城被打断",
  "Attack move": "攻击移动",
  "Move command": "移动指令",
  "Crimson harass": "红方消耗",
  "Crimson tower destroyed": "红方防御塔已摧毁",
  "风雪刀客已达到 6 级": "风雪刀客已达到 6 级",
  "Lane fixture: Wave reset": "兵线调试：兵线重置",
  "Lane fixture: Azure freeze": "兵线调试：蓝方控线",
  "Lane fixture: Enemy minion pressure": "兵线调试：敌方小兵压力",
  "Lane fixture: Enemy siege demolish": "兵线调试：敌方攻城拆塔",
  "Lane fixture: Crimson freeze": "兵线调试：红方控线",
  "Cast cancelled": "施法已取消",
  "Skill cooling down": "技能冷却中",
  "Ultimate locked": "终极技能未解锁",
  "Skill not learned": "技能未学习",
  "Not enough mana": "法力不足",
  Rooted: "被禁锢",
  "No skill points": "没有技能点",
  "Skill already maxed": "技能已满级",
  "No target in range": "范围内没有目标",
  "Mark consumed": "印记已消耗",
  "风雪刀客已复活": "风雪刀客已复活",
  "Crimson respawned": "绯红已复活",
  "Passive item": "这是被动装备",
  "Item not owned": "尚未拥有该装备",
  "Item cooling down": "装备冷却中",
  "No structure in range": "范围内没有建筑",
  "Cannot shop while dead": "死亡期间不能打开商店",
  "Item already owned": "已拥有该装备",
  "Shop is only available in base": "只能在基地打开商店",
  "Not enough gold": "金币不足",
  "Shop closed": "商店已关闭",
  "Shop opened": "商店已打开",
  "Settings opened": "设置已打开",
  "Settings closed": "设置已关闭",
  "Match ended": "对局已结束",
  Respawning: "复活中",
  "Settings open": "设置已打开",
  "Shop open": "商店已打开",
  "Scoreboard open": "计分板已打开",
  Casting: "施法中",
  "Empty item slot": "装备槽为空",
  "Super minion wave spawned": "超级兵线已刷新",
  "Siege wave spawned": "攻城兵线已刷新",
  "Minion wave spawned": "小兵兵线已刷新",
  "Victory: Crimson core destroyed": "胜利：红方核心已摧毁",
  "Defeat: Azure core destroyed": "失败：蓝方核心已摧毁",
  "雪饮刀气已释放": "雪饮刀气已释放",
  "冰风护体已展开": "冰风护体已展开",
  "风神腿突进": "风神腿突进",
  "傲寒狂刀已斩出": "傲寒狂刀已斩出",
};

const LANE_LABELS: Record<string, string> = {
  "Azure crash": "蓝方进塔",
  "Crimson crash": "红方进塔",
  "Azure freeze": "蓝方控线",
  "Crimson freeze": "红方控线",
  "Azure slow": "蓝方慢推",
  "Crimson slow": "红方慢推",
  "Wave reset": "兵线重置",
  "No wave": "无兵线",
  Neutral: "均势",
};

const localizeItemName = (itemId: string, fallback = itemId) => ITEM_LABELS[itemId as ItemId] ?? RAW_ITEM_LABELS[fallback] ?? fallback;
const localizeItemStats = (itemId: string, fallback: string) => ITEM_STATS[itemId as ItemId] ?? fallback;
const localizeActiveLabel = (label: string | null) => (label ? ACTIVE_LABELS[label] ?? label : null);
const localizeBuildingName = (id: string) => BUILDING_LABELS[id] ?? id.split("_").join(" ");
const localizeUnitName = (name: string) => (name === "Astra Vanguard" ? "星刃先锋" : name === "Crimson Duelist" ? "绯红决斗者" : name);
const localizeAiState = (state: GameSnapshot["enemyAi"]["state"]) => AI_STATE_LABELS[state] ?? state;
const localizeLaneLabel = (label: string) => LANE_LABELS[label] ?? label;

const localizeMessage = (message: string) => {
  const exact = MESSAGE_LABELS[message];
  if (exact) return exact;

  let match = message.match(/^Enemy gold set to (\d+)$/);
  if (match) return `敌方金币设为 ${match[1]}`;
  match = message.match(/^([QWER]) aiming$/);
  if (match) return `${match[1]} 瞄准中`;
  match = message.match(/^([QWER]) upgraded$/);
  if (match) return `${match[1]} 已升级`;
  match = message.match(/^([QWER]) buffered$/);
  if (match) return `${match[1]} 已缓存`;
  match = message.match(/^(hero|melee|caster|siege|super) targeted$/);
  if (match) return `已锁定${UNIT_KIND_LABELS[match[1] as UnitSnapshot["kind"]]}`;
  match = message.match(/^(.+) targeted$/);
  if (match) return `已锁定${localizeBuildingName(match[1].split(" ").join("_"))}`;
  match = message.match(/^Minion aggro (\d+)$/);
  if (match) return `${match[1]} 个小兵转火`;
  match = message.match(/^CS missed · (\d+)$/);
  if (match) return `漏刀 ${match[1]}`;
  match = message.match(/^Astra down · (\d+)s$/);
  if (match) return `星刃倒下 · ${match[1]}秒`;
  match = message.match(/^Crimson down · (\d+)s$/);
  if (match) return `绯红倒下 · ${match[1]}秒`;
  match = message.match(/^Level (\d+)$/);
  if (match) return `等级 ${match[1]}`;
  match = message.match(/^Champion takedown \+(\d+)g$/);
  if (match) return `击败英雄 +${match[1]}金`;
  match = message.match(/^Last hit \+(\d+)g(?: · streak (\d+))?$/);
  if (match) return `补刀 +${match[1]}金${match[2] ? ` · 连续 ${match[2]}` : ""}`;
  match = message.match(/^Crimson bought (.+)$/);
  if (match) return `红方购买了${localizeItemName("", match[1])}`;
  match = message.match(/^Granted Crimson (.+)$/);
  if (match) return `已给予红方${localizeItemName("", match[1])}`;
  match = message.match(/^Crimson used (.+)$/);
  if (match) return `红方使用了${localizeActiveLabel(match[1]) ?? match[1]}`;
  match = message.match(/^(.+) activated$/);
  if (match) return `${localizeActiveLabel(match[1]) ?? match[1]}已激活`;
  match = message.match(/^Slot (\d+) item not owned$/);
  if (match) return `${match[1]} 号槽未拥有装备`;
  match = message.match(/^Purchased (.+)$/);
  if (match) return `已购买${localizeItemName("", match[1])}`;
  match = message.match(/^(azure|crimson)_(outer_tower|inhibitor|core) destroyed$/);
  if (match) return `${localizeBuildingName(`${match[1]}_${match[2]}`)}已摧毁`;
  match = message.match(/^(Azure|Crimson) tower fired$/);
  if (match) return `${match[1] === "Azure" ? "蓝方" : "红方"}防御塔开火`;

  return message;
};

export const initHud = () => {
  const root = document.querySelector("#hud-root");
  if (!root) throw new Error("HUD root is missing");

  root.innerHTML = `
    <section class="scoreboard" aria-label="对局状态">
      <div class="team-score azure">蓝方 <strong data-score-azure>0</strong></div>
      <div class="timer" data-time>00:00</div>
      <div class="team-score crimson"><strong data-score-crimson>0</strong> 红方</div>
    </section>

    <section class="combat-readout" aria-label="玩家状态">
      <div class="portrait-frame"></div>
      <div class="bars">
        <div class="bar health"><span data-health-bar></span><em data-health-text></em></div>
        <div class="bar mana"><span data-mana-bar></span><em data-mana-text></em></div>
        <div class="stat-row">
          <span class="stat-pill">${icon(UI_ICON_URLS.status.level_up, "等级")}<strong data-level>1</strong></span>
          <span class="stat-pill">${icon(UI_ICON_URLS.status.gold, "金币")}<strong data-gold>842</strong></span>
          <span class="stat-pill secondary-stat">${icon(UI_ICON_URLS.status.skill_point, "经验")}<strong data-xp>0</strong></span>
          <span class="stat-pill text-stat">补 <strong data-last-hits>0</strong></span>
          <span class="stat-pill text-stat secondary-stat">连 <strong data-cs-streak>0</strong></span>
          <span class="stat-pill text-stat secondary-stat">漏 <strong data-missed-cs>0</strong></span>
          <span class="stat-pill text-stat secondary-stat">技 <strong data-skill-points>0</strong></span>
          <span class="stat-pill text-stat">波 <strong data-wave>1</strong></span>
          <span class="stat-pill text-stat lane-pill neutral" data-lane-pill>兵线 <strong data-lane-state>均势</strong></span>
        </div>
        <div class="recall-bar" data-recall-wrap hidden><span data-recall-bar></span><em data-recall-text></em></div>
      </div>
    </section>

    <section class="objective-panel" aria-label="当前目标">
      <div class="objective-header">
        <span>当前目标</span>
        <strong data-objective-title>红方外塔</strong>
      </div>
      <div class="objective-main">
        <div class="objective-bar"><i data-objective-progress></i></div>
        <em data-objective-state>待命</em>
      </div>
      <small data-objective-detail>跟随兵线推进，先消耗防御塔。</small>
    </section>

    <button class="settings-button" data-settings-toggle title="设置">设置</button>

    <section class="minimap" aria-label="小地图">
      <div class="minimap-lane"></div>
      <div data-minimap-dots></div>
    </section>

    <section class="first-run-panel" data-first-run-panel aria-label="对线引导">
      <strong data-first-run-title>对线计划</strong>
      <span data-first-run-text>补掉小兵，在基地花掉金币，再跟随兵线推进。</span>
    </section>

    <section class="ability-dock" aria-label="技能">
      ${(["q", "w", "e", "r"] as const)
        .map((skill) => {
          const src = UI_ICON_URLS.skills[`astra_${skill}`];
          return `
            <div class="ability-cell ${skill === "r" ? "ultimate-cell" : ""}">
              <button class="ability ${skill === "r" ? "ultimate" : ""}" data-skill="${skill}">${icon(src, skill.toUpperCase())}<span>${skill.toUpperCase()}</span><strong data-skill-rank="${skill}">${skill === "r" ? 0 : 1}</strong><em data-cooldown="${skill}"></em></button>
              <button class="skill-upgrade" data-upgrade="${skill}" aria-label="升级 ${skill.toUpperCase()}">+</button>
            </div>
          `;
        })
        .join("")}
      <button class="recall-button" data-recall title="回城">${icon(UI_ICON_URLS.status.recall, "回城")}<span>B</span></button>
    </section>

    <section class="item-dock" aria-label="装备">
      <button class="shop-button" data-shop-toggle title="商店">${icon(UI_ICON_URLS.status.shop, "商店")}<span>商店</span></button>
      ${Object.entries(UI_ICON_URLS.items)
        .map(([name, src]) => `<button class="item-slot" data-item="${name}" title="${localizeItemName(name)}">${icon(src, localizeItemName(name))}<span data-item-key="${name}"></span><em data-item-cooldown="${name}"></em></button>`)
        .join("")}
    </section>

    <section class="shop-panel" data-shop-panel hidden aria-label="基地商店">
      <div class="panel-header">
        <strong>基地商店</strong>
        <button class="panel-close" data-shop-close aria-label="关闭商店">×</button>
      </div>
      <div class="shop-status" data-shop-status></div>
      <div class="shop-grid" data-shop-items></div>
    </section>

    <section class="scoreboard-panel" data-scoreboard-panel hidden aria-label="计分板">
      <div class="panel-header">
        <strong>计分板</strong>
        <button class="panel-close" data-scoreboard-close aria-label="关闭计分板">×</button>
      </div>
      <div class="scoreboard-table" data-scoreboard-rows></div>
    </section>

    <section class="settings-panel" data-settings-panel hidden aria-label="设置">
      <div class="panel-header">
        <strong>设置</strong>
        <button class="panel-close" data-settings-close aria-label="关闭设置">×</button>
      </div>
      <div class="settings-list">
        <button class="setting-toggle" data-setting="quickCast"><span>快速施法</span><strong data-setting-value="quickCast"></strong></button>
        <button class="setting-toggle" data-setting="rangeIndicators"><span>范围指示</span><strong data-setting-value="rangeIndicators"></strong></button>
        <div class="setting-row"><span>商店</span><strong>P</strong></div>
        <div class="setting-row"><span>主动装备</span><strong>1-4</strong></div>
      </div>
    </section>

    <section class="death-overlay" data-death-overlay hidden aria-label="复活状态">
      <strong>复活中</strong>
      <span data-death-countdown></span>
      <em data-death-blocked></em>
      <small data-death-guidance></small>
      <div class="death-bar"><i data-death-progress></i></div>
    </section>

    <section class="status-chip" data-message>对线阶段</section>
    <section class="tower-danger-chip" data-tower-danger hidden></section>
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
      dispatchGameCommand({ type: "itemSlotAction", itemId: item.dataset.item as ItemId });
      return;
    }
    const shopBuy = element?.closest<HTMLButtonElement>("[data-shop-buy]");
    if (shopBuy?.dataset.shopBuy) {
      dispatchGameCommand({ type: "buyItem", itemId: shopBuy.dataset.shopBuy as ItemId });
      return;
    }
    if (element?.closest("[data-shop-toggle]")) {
      dispatchGameCommand({ type: "toggleShop" });
      return;
    }
    if (element?.closest("[data-shop-close]")) {
      dispatchGameCommand({ type: "setShopOpen", open: false });
      return;
    }
    if (element?.closest("[data-scoreboard-close]")) {
      dispatchGameCommand({ type: "setScoreboardOpen", open: false });
      return;
    }
    if (element?.closest("[data-settings-toggle]")) {
      dispatchGameCommand({ type: "toggleSettings" });
      return;
    }
    if (element?.closest("[data-settings-close]")) {
      dispatchGameCommand({ type: "setSettingsOpen", open: false });
      return;
    }
    const setting = element?.closest<HTMLButtonElement>("[data-setting]");
    if (setting?.dataset.setting === "quickCast") {
      dispatchGameCommand({ type: "toggleQuickCast" });
      return;
    }
    if (setting?.dataset.setting === "rangeIndicators") {
      dispatchGameCommand({ type: "toggleRangeIndicators" });
      return;
    }
    const upgrade = element?.closest<HTMLButtonElement>("[data-upgrade]");
    const upgradeKey = upgrade?.dataset.upgrade;
    if (upgradeKey === "q" || upgradeKey === "w" || upgradeKey === "e" || upgradeKey === "r") {
      dispatchGameCommand({ type: "upgradeSkill", skill: upgradeKey });
      return;
    }
    if (element?.closest("[data-recall]")) {
      dispatchGameCommand({ type: "startRecall" });
      return;
    }
    const skill = element?.closest<HTMLButtonElement>("[data-skill]");
    const skillKey = skill?.dataset.skill;
    if (skillKey === "q" || skillKey === "w" || skillKey === "e" || skillKey === "r") dispatchGameCommand({ type: "castSkill", skill: skillKey });
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
  query<HTMLElement>("[data-cs-streak]").textContent = String(snapshot.player.csStreak);
  query<HTMLElement>("[data-missed-cs]").textContent = String(snapshot.player.missedCs);
  query<HTMLElement>("[data-skill-points]").textContent = String(snapshot.player.skillPoints);
  query<HTMLElement>("[data-wave]").textContent = String(snapshot.lane.waveNumber);
  renderLaneState(snapshot);
  const castState = snapshot.casting.queuedSkill
    ? ` · ${snapshot.casting.queuedSkill.toUpperCase()} 已缓存`
    : snapshot.casting.locked && snapshot.casting.activeSkill
      ? ` · 正在施放 ${snapshot.casting.activeSkill.toUpperCase()}`
      : "";
  query<HTMLElement>("[data-message]").textContent = `${localizeMessage(snapshot.message)}${castState} · 敌方 ${localizeAiState(snapshot.enemyAi.state)}`;
  renderTowerDanger(snapshot);
  const recallWrap = query<HTMLElement>("[data-recall-wrap]");
  recallWrap.hidden = !snapshot.player.recalling;
  query<HTMLElement>("[data-recall-bar]").style.width = `${Math.round(snapshot.player.recallProgress * 100)}%`;
  query<HTMLElement>("[data-recall-text]").textContent = snapshot.player.recalling ? "正在回城" : "";

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

  renderObjectivePanel(snapshot);
  renderMinimap(snapshot.units, snapshot.buildings);
  renderFirstRunPanel(snapshot);
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

const renderObjectivePanel = (snapshot: GameSnapshot) => {
  const panel = query<HTMLElement>(".objective-panel");
  panel.hidden = snapshot.mode !== "playing" || snapshot.settings.open || snapshot.scoreboard.open || snapshot.shop.open;
  if (panel.hidden) return;

  const nextObjective = ENEMY_OBJECTIVE_ORDER.map((id) => snapshot.buildings.find((building) => building.id === id)).find((building) => building && building.hp > 0);
  const alliedWarning = ALLIED_OBJECTIVE_ORDER.map((id) => snapshot.buildings.find((building) => building.id === id)).find(
    (building) => building && (building.hp <= 0 || building.hp / building.maxHp <= 0.38),
  );

  const title = query<HTMLElement>("[data-objective-title]");
  const progress = query<HTMLElement>("[data-objective-progress]");
  const state = query<HTMLElement>("[data-objective-state]");
  const detail = query<HTMLElement>("[data-objective-detail]");

  if (!nextObjective) {
    title.textContent = "红方核心已摧毁";
    progress.style.width = "100%";
    state.textContent = "完成";
    detail.textContent = "胜利条件已达成。";
    panel.classList.remove("warning");
    return;
  }

  const hpRatio = nextObjective.hp / nextObjective.maxHp;
  title.textContent = localizeBuildingName(nextObjective.id);
  progress.style.width = percent(nextObjective.hp, nextObjective.maxHp);
  state.textContent = `${Math.round(hpRatio * 100)}%`;
  panel.classList.toggle("warning", Boolean(alliedWarning));

  if (alliedWarning) {
    detail.textContent = `${localizeBuildingName(alliedWarning.id)}${alliedWarning.hp <= 0 ? "已失守" : "血量偏低"}，避免空线被反推。`;
    return;
  }

  if (nextObjective.type === "tower") {
    detail.textContent = snapshot.towerDanger.active ? "先等己方小兵进塔，再消耗防御塔。" : "跟随兵线推进，优先消耗外塔。";
    return;
  }
  if (nextObjective.type === "inhibitor") {
    detail.textContent = "外塔已破，推进兵营以刷新超级兵。";
    return;
  }
  detail.textContent = "核心已暴露，护送兵线完成终结。";
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
    const position = { x: (building.x / 1600) * 100, y: (building.y / 900) * 100 };
    dots.push(`<img class="map-dot building" src="${src}" alt="${localizeBuildingName(building.id)}" style="left:${position.x}%; top:${position.y}%;" />`);
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
    dots.push(`<img class="map-dot" src="${src}" alt="${TEAM_LABELS[unit.team]}${UNIT_KIND_LABELS[unit.kind]}" style="left:${(unit.x / 1600) * 100}%; top:${(unit.y / 900) * 100}%;" />`);
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

  query<HTMLElement>("[data-shop-status]").textContent = snapshot.shop.available ? `${snapshot.player.gold} 金可用` : "返回基地后可购买";
  const signature = JSON.stringify({
    gold: snapshot.player.gold,
    available: snapshot.shop.available,
    items: snapshot.shop.items,
    recommended: recommendedShopItemId(snapshot),
  });
  if (signature === lastShopSignature) return;
  lastShopSignature = signature;
  query<HTMLElement>("[data-shop-items]").innerHTML = snapshot.shop.items
    .map((item) => {
      const src = UI_ICON_URLS.items[item.id as keyof typeof UI_ICON_URLS.items];
      const disabled = item.owned || !item.available || !item.affordable;
      const recommended = item.id === recommendedShopItemId(snapshot);
      const itemName = localizeItemName(item.id, item.name);
      const activeLabel = localizeActiveLabel(item.activeLabel);
      const state = item.owned ? "已拥有" : item.affordable ? `${item.cost}金` : `差 ${item.cost - snapshot.player.gold}金`;
      return `
        <article class="shop-item ${item.owned ? "owned" : ""} ${!item.affordable ? "locked" : ""} ${recommended ? "recommended" : ""}">
          ${icon(src, itemName)}
          <div>
            <strong>${itemName}</strong>
            <span>${localizeItemStats(item.id, item.stats)}${activeLabel ? ` · ${activeLabel} [${item.slot}]` : ""}</span>
            ${recommended ? "<small>推荐下一件</small>" : ""}
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
              return `<img src="${src}" alt="${localizeItemName(itemId)}" />`;
            })
            .join("")
        : `<span class="empty-items">空</span>`;
      return `
        <div class="scoreboard-row ${row.team}">
          <strong>${localizeUnitName(row.name)}</strong>
          <span>等级 ${row.level}</span>
          <span>${row.kills} / ${row.deaths}</span>
          <span>补刀 ${row.lastHits}</span>
          <span>${row.gold}金</span>
          <span class="row-state">${row.alive ? "存活" : `${row.respawnTimer}秒`}</span>
          <div class="row-items">${itemIcons}</div>
        </div>
      `;
    })
    .join("");
};

const renderSettings = (snapshot: GameSnapshot) => {
  const panel = query<HTMLElement>("[data-settings-panel]");
  panel.hidden = !snapshot.settings.open;
  query<HTMLElement>('[data-setting-value="quickCast"]').textContent = snapshot.settings.quickCast ? "开" : "关";
  query<HTMLElement>('[data-setting-value="rangeIndicators"]').textContent = snapshot.settings.showRangeIndicators ? "开" : "关";
};

const renderDeath = (snapshot: GameSnapshot) => {
  const overlay = query<HTMLElement>("[data-death-overlay]");
  overlay.hidden = snapshot.player.alive;
  if (snapshot.player.alive) return;
  query<HTMLElement>("[data-death-countdown]").textContent = `${snapshot.player.deathTimer.toFixed(1)}秒`;
  query<HTMLElement>("[data-death-blocked]").textContent = localizeMessage(snapshot.controls.reason);
  query<HTMLElement>("[data-death-guidance]").textContent = "在基地复活后先花金币，再跟随兵线回到战场。";
  query<HTMLElement>("[data-death-progress]").style.width = `${Math.round(snapshot.player.respawnProgress * 100)}%`;
};

const renderFirstRunPanel = (snapshot: GameSnapshot) => {
  const panel = query<HTMLElement>("[data-first-run-panel]");
  const title = query<HTMLElement>("[data-first-run-title]");
  const text = query<HTMLElement>("[data-first-run-text]");
  panel.classList.toggle("danger", snapshot.towerDanger.active && snapshot.towerDanger.unsupported);
  panel.classList.toggle("shop", snapshot.shop.available);
  panel.hidden = snapshot.mode !== "playing" || snapshot.time > 140 || snapshot.settings.open || snapshot.scoreboard.open || snapshot.shop.open;
  if (panel.hidden) return;
  if (!snapshot.player.alive) {
    title.textContent = "重整";
    text.textContent = "在基地复活，购买下一件关键装备，再跟随兵线回线。";
    return;
  }
  if (snapshot.towerDanger.active && snapshot.towerDanger.unsupported) {
    title.textContent = "越塔风险";
    text.textContent = "先后撤，或等待己方小兵进塔后再攻击建筑。";
    return;
  }
  if (snapshot.shop.available && recommendedShopItemId(snapshot)) {
    title.textContent = "花掉金币";
    text.textContent = `推荐：${recommendedShopItemName(snapshot)}。离开基地前先购买。`;
    return;
  }
  if (snapshot.player.lastHits < 3) {
    title.textContent = "对线计划";
    text.textContent = "稳住兵线，补掉低血小兵，避免吸引防御塔火力。";
    return;
  }
  if (snapshot.buildings.some((building) => building.type === "inhibitor" && building.team === "crimson" && building.hp > 0)) {
    title.textContent = "下个目标";
    text.textContent = "先拆防御塔，再破兵营，让超级兵压向核心。";
    return;
  }
  title.textContent = "终结";
  text.textContent = "护送超级兵，摧毁暴露的核心。";
};

const renderLaneState = (snapshot: GameSnapshot) => {
  const pill = query<HTMLElement>("[data-lane-pill]");
  const azurePressure = snapshot.lane.pressure.startsWith("azure_");
  const crimsonPressure = snapshot.lane.pressure.startsWith("crimson_");
  pill.classList.toggle("azure", azurePressure);
  pill.classList.toggle("crimson", crimsonPressure);
  pill.classList.toggle("neutral", !azurePressure && !crimsonPressure);
  const progress = snapshot.lane.progress === null ? "" : ` ${Math.round(snapshot.lane.progress * 100)}%`;
  const aggroMinions = snapshot.lane.azureAggroMinions + snapshot.lane.crimsonAggroMinions;
  const aggro = aggroMinions > 0 ? ` · 仇恨 ${aggroMinions}` : "";
  query<HTMLElement>("[data-lane-state]").textContent = `${localizeLaneLabel(snapshot.lane.label)}${progress}${aggro}`;
};

const renderTowerDanger = (snapshot: GameSnapshot) => {
  const chip = query<HTMLElement>("[data-tower-danger]");
  chip.hidden = !snapshot.towerDanger.active;
  if (!snapshot.towerDanger.active) return;
  chip.classList.toggle("unsupported", snapshot.towerDanger.unsupported);
  chip.textContent = snapshot.towerDanger.unsupported
    ? `进入敌塔范围 · 无小兵掩护 · 先后撤 · 下一发 ${snapshot.towerDanger.nextDamage}`
    : `进入敌塔范围 · 有小兵掩护 · 下一发 ${snapshot.towerDanger.nextDamage}`;
};

const recommendedShopItemId = (snapshot: GameSnapshot) => {
  if (snapshot.player.items.length === 0) return "bronze_sword";
  if (!snapshot.player.items.includes("plated_boots")) return "plated_boots";
  if (snapshot.player.hp / snapshot.player.maxHp < 0.45 && !snapshot.player.items.includes("guard_shield")) return "guard_shield";
  if (snapshot.player.hp / snapshot.player.maxHp < 0.55 && !snapshot.player.items.includes("vitality_core")) return "vitality_core";
  if (snapshot.player.mana / snapshot.player.maxMana < 0.35 && !snapshot.player.items.includes("focus_crystal")) return "focus_crystal";
  if (snapshot.player.mana / snapshot.player.maxMana < 0.55 && !snapshot.player.items.includes("rift_lens")) return "rift_lens";
  if (!snapshot.player.items.includes("haste_talisman")) return "haste_talisman";
  if (!snapshot.player.items.includes("siege_hammer")) return "siege_hammer";
  return null;
};

const recommendedShopItemName = (snapshot: GameSnapshot) => {
  const id = recommendedShopItemId(snapshot);
  const item = snapshot.shop.items.find((candidate) => candidate.id === id);
  return item ? localizeItemName(item.id, item.name) : ITEM_LABELS.bronze_sword;
};

const renderResult = (snapshot: GameSnapshot) => {
  const banner = query<HTMLElement>("[data-result]");
  if (snapshot.mode === "playing") {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  query<HTMLElement>("[data-result-title]").textContent = snapshot.mode === "victory" ? "胜利" : "失败";
  query<HTMLElement>("[data-result-subtitle]").textContent = localizeMessage(snapshot.message);
  const summary = snapshot.matchSummary;
  query<HTMLElement>("[data-result-summary]").innerHTML = summary
    ? `
      <span>${formatTime(summary.duration)}</span>
      <span>战绩 ${summary.player.kills} / ${summary.player.deaths}</span>
      <span>补刀 ${summary.player.lastHits}</span>
      <span>${summary.player.items.length} 件装备</span>
      <span>敌方 ${summary.enemy.kills} / ${summary.enemy.deaths}</span>
    `
    : "";
};
