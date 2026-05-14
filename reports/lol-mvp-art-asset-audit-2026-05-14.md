# LoL-like MVP Art Asset Audit

日期：2026-05-14

## 直接结论

当前项目已经具备“可玩单线 MOBA MVP”的角色、小兵、建筑、技能 VFX、UI 图标资产基础，但还没有达到“英雄联盟式视觉 MVP”的地图与场景完整度。

最大差距不是角色或小兵，而是地图背景与地形层：

- 当前运行时地图由 `src/game/MobaScene.ts` 的 `drawMap()` 使用 Phaser `Graphics` 程序化绘制，主要是纯色草地、斜向道路、基地椭圆和暗色椭圆装饰。
- `assets/images/moba-interface-concept.png` 是高质量概念图，但没有作为运行时地图或 UI 资产接入。
- 当前没有独立的 map background、tilemap、lane decal、brush、river、jungle、fountain、shopkeeper、neutral objective pit 等资产。

因此，下一步若目标是“英雄联盟 MVP”，优先级应是：

1. 先做一张原创 LoL-like 单线地图背景，并接入运行时。
2. 再补 dedicated inhibitor 与 visually distinct super minion。
3. 然后补 brush / jungle edge / river 或 neutral objective，占位即可。

## 调研基准

### Riot / LoL 资产与玩法分类

Riot Developer Portal 的 Data Dragon 明确覆盖 League of Legends 的静态数据和资产，类别包括 champions、items、runes、summoner spells、profile icons，并提供 champion square、passive、spell、item、summoner spell、minimap、sprite、scoreboard icon 等图片资源路径。

本次在线读取 Data Dragon 最新版本为 `16.10.1`：

| 类别 | Data Dragon 当前数量 |
| --- | ---: |
| Champions | 172 |
| Items | 705 |
| Summoner spells | 18 |

这些数量不是 MVP 目标。对本项目有价值的是资产分类结构：hero/champion、spell icons、item icons、minimap、map/objective icons、scoreboard/HUD assets。

Riot 官方 How to Play 页强调的 MVP 玩法视觉对象包括：

- 三路与野区；
- Baron Nashor 与 Drakes；
- 经验、金币、物品成长；
- champion 的 passive、Q/W/E/R、summoner spells、items；
- lane roles 与基地推进目标。

League of Legends Wiki 对 Summoner's Rift 的结构描述补充了可视对象分类：

- base、spawn、shop、turret、inhibitor、nexus；
- outer / inner / inhibitor / nexus turrets；
- lane、river、jungle、brush、plants；
- melee / caster / siege / super minions；
- neutral monsters 与 epic monsters。

### Context7 / Phaser 实现侧基准

Context7 查询 `/phaserjs/phaser` 后，和本项目最相关的 Phaser 资产 API 是：

- `this.load.image()`：适合单张 map background、static prop、building state。
- `this.load.spritesheet()`：适合当前 64x64 fixed-cell unit spritesheets。
- `this.load.atlas()` / `this.load.multiatlas()`：适合后续 UI、props、VFX 合并。
- `this.load.tilemapTiledJSON()`：适合后续把地图拆成 tilemap/layers/collision/brush zones。

当前项目已经正确使用 fixed-frame spritesheet 思路加载单位动画，但地图层还没有进入 image/tilemap pipeline。

### DeepWiki 参考

DeepWiki 查询 `LeagueSandbox/GameServer` 的高层实体结构，得到的 LoL-like 核心对象分类与上面一致：

- champions；
- melee/caster/cannon/super minions；
- turrets；
- inhibitors；
- nexus；
- fountains；
- shops；
- neutral monsters；
- spells；
- buffs；
- items。

这说明当前单线 MVP 的核心推进链方向是对的，但地图/场景资产仍缺少一层“让玩家一眼看出这是 MOBA 战场”的视觉语义。

## 当前项目资产盘点

### 运行时引用完整性

`src/game/assets.ts` 中引用的图片路径共 `39` 个，当前全部存在，没有 missing asset。

### 已有单位资产

当前 `UNIT_ASSETS` 覆盖：

| 类型 | Asset ID | 状态 |
| --- | --- | --- |
| Player hero | `astra_vanguard` | 64x64，8方向，`idle/move/basic_attack/cast/hit/death` |
| Enemy hero | `crimson_duelist` | 64x64，8方向，`idle/move/basic_attack/cast/hit/death` |
| Azure melee minion | `azure_melee_minion` | 64x64，8方向，5动作 |
| Crimson melee minion | `crimson_melee_minion` | 64x64，8方向，5动作 |
| Azure caster minion | `azure_caster_minion` | 64x64，8方向，5动作 |
| Crimson caster minion | `crimson_caster_minion` | 64x64，8方向，5动作 |
| Azure siege minion | `azure_siege_minion` | 64x64，8方向，5动作，QA 已补齐 |
| Crimson siege minion | `crimson_siege_minion` | 64x64，8方向，5动作，QA 已补齐 |

评估：单位资产已经满足单线 MVP。主要缺口是 super minion 目前复用 siege minion 资产，只在 gameplay kind 上区分，不够直观。

### 已有建筑资产

当前 `BUILDING_ASSETS` 覆盖：

| Asset ID | 状态 | 运行时用途 |
| --- | --- | --- |
| `azure_outer_tower` | `idle/attack/destroyed` | 蓝方外塔 |
| `crimson_outer_tower` | `idle/attack/destroyed` | 红方外塔 |
| `azure_core` | `idle/damaged/destroyed` | 蓝方 core，同时复用为蓝方 inhibitor |
| `crimson_core` | `idle/damaged/destroyed` | 红方 core，同时复用为红方 inhibitor |

评估：外塔和核心足够支撑当前 MVP；inhibitor 已有玩法实体，但视觉上复用 core，是 P0/P1 之间的缺口。若目标强调“像 LoL 的推进终局”，应补 dedicated inhibitor asset。

### 已有 VFX 资产

| Asset ID | 内容 |
| --- | --- |
| `astra_skill_vfx` | `q_slash_arc/w_shield_pulse/e_dash_trail/r_shockwave` |
| `crimson_skill_vfx` | `q_spear_thrust/basic_attack_arc` |

评估：玩家英雄 QWER 的 VFX 基础已经够 MVP；敌方 VFX 偏薄，但不是当前最大阻塞。后续如果做第二个完整英雄，敌方也应补齐 QWER-like VFX。

### 已有 UI 图标

`moba_ui_icons` metadata 包含：

| 图标组 | 数量 | 状态 |
| --- | ---: | --- |
| Skill icons | 8 | `astra_q/w/e/r` 与 `crimson_q/w/e/r` |
| Item icons | 6 | 当前商店 6 件原创装备 |
| Minimap icons | 8 | hero/minion/tower/core 双阵营 |
| Status icons | 6 | gold/level_up/skill_point/recall/death_timer/shop |

评估：HUD/Icon 已经满足单线 MVP。缺口是 minimap 没有 inhibitor、super minion、brush、neutral objective 图标；如果补地图机制，需要同步补图标。

### 地图与背景资产

当前存在：

- `assets/images/moba-interface-concept.png`：高质量概念图。
- `src/game/MobaScene.ts` 的 `drawMap()`：运行时真正使用的程序化地图。

当前缺失：

- runtime map background；
- tilemap / map layer JSON；
- lane paving detail；
- brush / jungle foliage；
- river / pit；
- shop / fountain visual；
- base wall / gate / terrain prop；
- neutral objective prop；
- map decal / ambient props。

评估：这是当前距离 LoL-like MVP 最大的视觉缺口。角色、小兵和建筑在当前程序化地图上已经能跑，但整体截图更像“带精灵的调试场景”，还不是“完整 MOBA 地图”。

## 与 LoL-like MVP 的差距矩阵

| 模块 | LoL-like MVP 需要 | 当前状态 | 结论 |
| --- | --- | --- | --- |
| 地图底图 | 至少一条有石板路、基地、草地、地形边界的单线战场 | 程序化色块和斜路 | P0 缺口 |
| 地形语义 | brush、jungle edge、river/pit 至少占位一类 | 无 brush/river/jungle 资产 | P1 缺口 |
| 英雄 | 1 个玩家英雄 + 1 个敌方英雄，完整动作 | 已有 | 达标 |
| 小兵 | melee/caster/siege/super 视觉区分 | melee/caster/siege 有，super 复用 siege | 基本达标，super 需增强 |
| 防御建筑 | tower、inhibitor、core/nexus 视觉区分 | tower/core 有，inhibitor 复用 core | P1 缺口 |
| 野怪 | 至少一个 neutral objective 或 camp | 无 | MVP 可推迟，P2 |
| 技能 VFX | 玩家 QWER 清晰可读 | 已有 | 达标 |
| 敌方技能 VFX | 敌方技能至少基础可读 | 偏少 | P2 |
| Item icons | 少量原创装备图标和推荐购买 | 6 件原创装备 | 达标 |
| Shop/Fountain | 基地内可识别购买/回复区域 | gameplay 有，视觉是基地椭圆 | P1 缺口 |
| Minimap | 关键单位/建筑位置 | 有基础点位 | 基本达标，缺新对象 |
| HUD 风格 | 血蓝、技能、装备、金币、死亡、提示 | 已有 | 达标 |
| 资产 QA | sprite manifest、validation、preview、visual review | 角色/小兵基本齐，siege 已补齐 | 达标 |

## 当前最重要的风险

### P0：地图背景没有接入运行时

当前截图中，英雄和建筑质量明显高于地面/地图。这个反差会让玩家第一眼判断为 prototype/debug board，而不是 MOBA MVP。

建议验收标准：

- `src/game/assets.ts` 增加 map background 或 tilemap asset；
- `MobaScene.drawMap()` 至少先绘制一张背景图，再叠加必要的 gameplay range/debug graphics；
- 运行截图中能看到 lane、base、terrain/brush/jungle edge，而不是大面积纯色形状；
- `playtest-artifacts/art-audit-current/shot-*.png` 或新 smoke 截图证明背景已进入游戏画面。

### P1：inhibitor 视觉复用 core

玩法上已经有 inhibitor/super minion，但画面上 inhibitor 和 core 都使用 core asset，只靠大小区分。玩家很难理解推进顺序。

建议验收标准：

- 新增 `azure_inhibitor`、`crimson_inhibitor` building assets；
- `BUILDING_ASSETS` 不再让 inhibitor 复用 core；
- minimap 增加 inhibitor icon 或复用但要有不同 shape；
- victory path 截图中能清楚分辨 tower、inhibitor、core。

### P1：super minion 没有独立视觉

super minion 目前使用 siege minion asset。玩法是对的，但视觉反馈不够。

建议验收标准：

- 生成 `azure_super_minion`、`crimson_super_minion`，至少 `idle/move/basic_attack/hit/death`；
- 比 siege minion 更高、更重、更亮或带核心能量；
- `spawnWave()` 使用 super asset，而不是 siege asset；
- `npm run test:mvp` 保持通过，并在 MVP screenshot 中可见 super minion。

### P1：地图交互对象缺少 brush / jungle edge

如果继续向 LoL-like 推进，brush 比完整 jungle 更适合下一步，因为它成本低、视觉强、规则也清晰。

建议验收标准：

- 地图上至少两段 brush 视觉区域；
- player/enemy 进入 brush 时 snapshot 暴露 `inBrush`；
- minimap 或 HUD 不需要复杂 fog，先只做局部攻击意图隐藏或提示即可。

## 推荐下一轮资产任务顺序

### Step 1：生成并接入原创单线 MOBA 地图背景

目标：先把当前程序化地面替换成能一眼识别为 MOBA 战场的背景。

建议输出：

- `assets/maps/single_lane_rift/source/...`
- `assets/maps/single_lane_rift/final/map-background.png`
- `assets/maps/single_lane_rift/final/map-collision-zones.json`
- `assets/maps/single_lane_rift/qa/visual-review.json`

最低视觉内容：

- 蓝方西南基地；
- 红方东北基地；
- 中央单线石板路；
- 两侧草地和森林边界；
- 至少两块 brush；
- 可选一条暗示 river 或 neutral pit 的区域；
- clear gameplay readability，不能过暗、过花、压住单位。

### Step 2：补 dedicated inhibitor assets

目标：让推进链 `tower -> inhibitor -> core` 在视觉上成立。

建议输出：

- `assets/sprites/buildings/azure/azure_inhibitor/...`
- `assets/sprites/buildings/crimson/crimson_inhibitor/...`
- states：`idle/damaged/destroyed`

### Step 3：补 dedicated super minion sprites

目标：让 inhibitor reward 有强视觉反馈。

建议输出：

- `assets/sprites/minions/azure/azure_super_minion/run/...`
- `assets/sprites/minions/crimson/crimson_super_minion/run/...`
- 64x64，8 directions，`idle/move/basic_attack/hit/death`

### Step 4：补 minimap / HUD 新对象图标

目标：保证新增对象进入 UI 语义。

建议补：

- inhibitor icons；
- super minion icons；
- brush/neutral objective icons，如有新机制。

### Step 5：再考虑 neutral objective

单线 MVP 不急着做完整 jungle。更稳的做法是先做一个中立 boss/camp 占位：

- 位置：单线侧边 pit；
- 资产：一个原创 drake-like 或 sentinel-like neutral monster；
- 玩法：击杀给全队 buff 或强化下一波 minions；
- 优先级低于地图背景、inhibitor、super minion。

## 验证记录

本轮核查实际执行：

- `npm run preview -- --host 127.0.0.1 --port 4173`
- `node /Users/zhangjinhui/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js --url http://127.0.0.1:4173 --actions-file playtest-artifacts/runtime-actions.json --iterations 3 --pause-ms 250 --screenshot-dir playtest-artifacts/art-audit-current`
- inspected `playtest-artifacts/art-audit-current/shot-2.png`
- inspected `assets/images/moba-interface-concept.png`
- inspected `assets/sprites/buildings/building-assets-contact-overview.png`
- inspected `assets/sprites/ui/moba_ui_icons/qa/moba_ui_icons-contact-overview.png`
- checked `src/game/assets.ts` references: `39` referenced image paths, `0` missing

## 参考来源

- Riot Developer Portal, Data Dragon: https://developer.riotgames.com/docs/lol
- League of Legends How to Play: https://www.leagueoflegends.com/en-us/how-to-play/
- Summoner's Rift overview: https://wiki.leagueoflegends.com/en-us/Summoner%27s_Rift
- Minion overview: https://wiki.leagueoflegends.com/en-us/Minion
- Inhibitor overview: https://wiki.leagueoflegends.com/en-us/Inhibitor
- Monster overview: https://wiki.leagueoflegends.com/en-us/Monster
- Context7 Phaser docs query: `/phaserjs/phaser`
- DeepWiki query: `LeagueSandbox/GameServer`
