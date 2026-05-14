# Mini LoL 更新计划

## 0. 文档状态

更新时间：2026-05-13

本文件是基于当前仓库实现、Phaser 资料、DeepWiki/Context7 查询结果，以及英雄联盟核心玩法资料整理出的下一轮更新计划。目标不是复制英雄联盟的商业内容、数值或资产，而是参考其可验证的 MOBA 机制结构，继续推进 `mini-lol` 的原创单线 2.5D MOBA 原型。

本次计划只定义后续优化与重构路线，不要求一次性实现全部内容。

## 1. 直接结论

当前游戏已经具备可玩的单线 MOBA 闭环：英雄移动、普攻、技能、补刀、经验、装备、回城、兵线、防御塔、基地核心、敌方 AI、HUD、胜负结算和 Playwright 调试钩子都已经存在。

下一阶段最值得做的不是继续堆新功能，而是先做两件事：

1. 把玩法规则从 `src/game/MobaScene.ts` 中拆出，形成可测试、可调参、可复用的 simulation 层。
2. 继续补强 LoL-like 对线决策链：兵线管理、防御塔仇恨、补刀反馈、回城时机、装备成长、AI 对线压力。

推荐先执行 “系统边界重构 + 兵线/防御塔机制深化” 这条路线。原因是审计基线中的 `MobaScene.ts` 已经达到 2879 行，本轮拆分后当前为 1745 行，仍承担 Phaser Scene lifecycle、asset loading、render sync、input 和主要 runtime orchestration。继续直接加功能会让后续调参、测试和移动端适配成本快速上升。

## 2. 本次调研依据

### 2.1 外部玩法参考

| 来源 | 本计划采用的信息 |
| --- | --- |
| Riot 官方 How to Play | League 的胜利目标是摧毁敌方 Nexus；基地包含 Nexus、Fountain、Shop；推进路径受到 turret/inhibitor 阻挡；英雄通过经验、金币、技能和物品成长；技能映射到 Q/W/E/R。 |
| Leaguepedia Minions and Towers | Minion 是沿 lane 前进和自动攻击的 AI 单位；last-hit 给予金币，附近死亡给予经验；wave 由 melee、caster、siege/super 等单位组成；turret 具有防守推进节奏、目标优先级和建筑可攻击顺序。 |
| MOBAFire Last Hitting | 补刀是 laning 的核心技能；玩家需要读懂攻击动画、伤害潜力和塔下补刀节奏。 |
| MOBAFire Turret | Turret 会攻击敌方单位；敌方英雄伤害己方英雄时会切换仇恨；失去当前目标后再按优先级选择新目标。 |

### 2.2 MCP 与框架参考

| 工具 | 查询对象 | 结论 |
| --- | --- | --- |
| Context7 | `/phaserjs/phaser/v3_90_0` | Phaser Scene 的 `preload/create/update`、Loader、AnimationManager、InputPlugin、CameraManager 是当前架构的正确基础，但不应让 Scene 成为全部玩法状态的唯一所有者。 |
| DeepWiki | `phaserjs/phaser` | Phaser Scene 本身封装 display list、update loop、camera、input、loader；维护性更好的做法是让 Scene 编排 renderer/input，把 gameplay rules、AI、combat、economy 和 debug state 拆成模块或并行 Scene。 |
| 本地代码 | `src/game/MobaScene.ts`、`src/ui/hud.ts`、`src/game/assets.ts`、`src/game/types.ts`、`progress.md` | 当前已有大量可用功能，但核心规则和渲染同步过度集中，HUD 也通过字符串模板和 `window.miniLolDebug` 与 Scene 强耦合。 |
| `.codex/skills/game-character-sprites` | 本地 sprite 生产 skill | 后续角色、小兵等固定 cell 2D 精灵图必须走该 skill，按 64x64 默认或明确指定尺寸，输出 run manifest、clean sheet、metadata、contact sheet、validation JSON 和 GIF/WebP 预览。 |
| `.codex/skills/codex-gateway-imagegen` | 本地生图 gateway skill | 后续概念图、单张 raster 参考图、sprite 源图或编辑图必须走该 skill，通过 gateway 生成并保存到当前工作区，不把最终资产只留在临时目录。 |

### 2.3 资产生产约束

后续所有新增美术资产按以下规则执行：

1. 角色、英雄、小兵、带动作的单位精灵图：使用 `.codex/skills/game-character-sprites`。
2. 概念图、静态参考图、单张图像生成或图像编辑：使用 `.codex/skills/codex-gateway-imagegen`。
3. 生成资产必须进入项目目录，并保留 source、manifest、metadata、QA 和 preview，不能只提交最终 PNG。
4. 角色类 sprite 默认优先 64x64；若明确需要 32/64/128 多尺寸，必须分别生成 native 输出，不能用单张图简单缩放冒充。
5. 所有美术命名和视觉设定继续保持原创，不复制 LoL 角色、图标、地图或商业素材。

## 3. 当前实现快照

### 3.1 技术栈

| 项目 | 当前状态 |
| --- | --- |
| Runtime | Phaser `3.90.0` |
| Build | Vite `8.0.12` + TypeScript `6.0.3` |
| Entry | `src/main.ts` 创建 Phaser game，并初始化 DOM HUD |
| Core Scene | `src/game/MobaScene.ts`，审计基线 2879 行，本轮拆分后当前 1745 行 |
| HUD | `src/ui/hud.ts`，434 行 |
| Asset manifest | `src/game/assets.ts`，集中管理 generated sprite、building、VFX、UI icon URL |
| Snapshot contract | `src/game/types.ts`，提供 `GameSnapshot`、unit/building/shop/scoreboard/result/enemy AI trace 状态 |
| Verification history | `progress.md` 记录多轮 `npm run build`、runtime assertions 和 browser smoke playtest |

### 3.2 已实现的高价值玩法

| 系统 | 当前能力 |
| --- | --- |
| 单局目标 | 摧毁敌方 core 胜利，己方 core 被摧毁失败 |
| 英雄 | 玩家英雄 Astra Vanguard 与敌方 AI 英雄 Crimson Duelist |
| 输入 | 键盘移动、点击目标、attack move、Q/W/E/R、B 回城、P 商店、Tab 计分板、Esc 设置 |
| 技能 | 蓝方 Q/W/E/R，有 mana、cooldown、rank、aim preview、cast lockout、input buffer、mark/consume combo |
| 普攻 | 有追击到攻击距离、attack windup、延迟结算、last-hit gold |
| 兵线 | 每 25 秒刷 3 melee + 3 caster，每第 3 波追加 siege |
| 经济成长 | last-hit gold、nearby XP、level、skill point、shop item、active item |
| 防御塔 | tower range、tower fire、tower-gated core damage、hero aggro 初版 |
| 回城/基地 | recall channel、移动/伤害打断、基地回血回蓝、shop area |
| AI | Laning、Harass、Retreat、All In、Recall 状态与 last-hit economy |
| HUD | 血量、法力、等级、金币、CS、技能、装备、商店、设置、计分板、死亡倒计时、结果面板、小地图 |
| Test hooks | `window.advanceTime`、`window.render_game_to_text`、`window.miniLolDebug` |

## 4. 关键问题审计

### 4.1 P0：`MobaScene` 已经成为 God Object

证据：

- Scene lifecycle、game loop 和渲染初始化集中在 `MobaScene.create/update/step`。
- 同一文件同时包含 input、AI、combat、skill、economy、shop、death/respawn、view sync、debug hooks、snapshot。
- 当前 `step` 每帧顺序调用十几个系统，但这些系统没有独立状态边界。

风险：

- 新增 jungle、brush、fog、更多英雄或移动端输入时，会持续扩大单文件复杂度。
- 单元测试只能通过 Scene/debug hooks 间接验证规则，难以纯逻辑测试。
- 平衡性调参必须改 TypeScript 常量，无法做配置快照、难度档位或回放对比。

建议：

1. 新建 `src/game/simulation/`，把 `Unit`、`Building`、combat event、economy、skill config、wave config、tower targeting、AI decision 拆出去。
2. 让 Phaser Scene 只负责 asset loading、view creation、input adapter、camera、VFX、HUD snapshot bridge。
3. 保留 `GameSnapshot` 作为 UI/test 契约，但让它由 simulation state 生成，而不是由 Scene 私有字段拼装。

### 4.2 P0：数值配置没有形成稳定配置层

证据：

- `WORLD_WIDTH`、`WAVE_INTERVAL`、`LEVEL_XP_REQUIREMENTS`、`SKILL_CONFIG`、`ITEM_CATALOG`、tower/minion/hero stats 都直接写在 `MobaScene.ts`。
- 当前配置既用于玩法逻辑，也用于 HUD 和 debug state。

风险：

- 无法快速做 Easy/Normal/Hard 难度。
- 无法做“LoL-like 机制，不复制数值”的独立平衡表。
- 每次调参都增加回归风险。

建议：

1. 拆出 `src/game/data/game-config.ts`，包含 world、lane、wave、hero、minion、building、skill、item、ai、economy。
2. 用 `as const satisfies` 约束配置结构，避免 item active、skill rank、asset id 拼错。
3. 后续再考虑 JSON 化；当前先保持 TypeScript 配置，便于类型推导和重构。

### 4.3 P1：防御塔机制还不够形成高压决策

当前已实现：

- 塔会攻击范围内敌人。
- 英雄攻击己方英雄时能触发初版 tower hero aggro。
- core 受 outer tower gating 保护。
- 防御塔普通目标选择已细化为 `siege -> melee -> caster -> champion`，强制英雄仇恨仍然最高优先级。
- 强制英雄仇恨下，防御塔连续攻击同一英雄会递增伤害，降低越塔长期换血收益。
- 英雄或单位普攻建筑时，如果附近没有己方小兵，会受到 structure damage penalty，降低无兵线硬拆效率。
- 玩家进入敌方防御塔范围时，HUD 会显示 tower danger indicator；无己方小兵掩护时明确提示 no minion cover 和下一发塔伤。

与 LoL-like 参考的差距：

- tower range 当前仍是常驻显示，后续可改成靠近/选中/危险态差异化显示。
- 防御塔仇恨还缺少更细的目标提示，例如当前锁定目标、连续塔伤 stack 的视觉层级。

建议：

1. 基础 tower system 已提取到 `src/game/simulation/towers.ts`，并已加入 `forcedHeroAggro -> siege -> melee -> caster -> champion` 优先级。
2. champion ramping damage 已加入 tower simulation：同一英雄在 forced aggro 下连续吃塔伤会按 stack 递增。
3. building basic attack damage 已增加 `hasAlliedMinionNearby` 修正，减少无兵线硬拆；后续可继续评估技能和主动道具是否也应进入该规则。
4. HUD tower danger indicator 已接入 snapshot：玩家进入敌塔且无己方 minion 时会明显提示，并显示下一发塔伤。

### 4.4 P1：兵线系统还不能支撑 wave management

当前已实现：

- 固定间隔刷线。
- 每波 melee/caster，第 3 波 siege。
- 小兵自动寻找敌方单位或建筑。
- last-hit gold 和附近 XP 已分离。
- `GameSnapshot.lane` 已暴露 wave number、next siege wave、lane pressure、frontline progress、tactical point、双方小兵数量和 HUD label；`UnitSnapshot` 已暴露每个单位的 `laneProgress`。
- HUD 战斗面板已显示 Lane 状态 chip，例如 `Wave reset 50%`、`Azure slow 67%`、`Crimson freeze 64%`、`Azure crash 76%`。
- `src/game/simulation/lane-path.ts` 已抽出 lane waypoints、path projection progress、tactical points、off-path return target、formation lateral offset 和按队伍推进的 look-ahead lane target；小兵无目标时会先回到 lane path，再沿带横向错位的 lane path 目标推进，并会在同队前方小兵过近时保持基础队列间距。
- 小兵已有短期 aggro memory：英雄攻击敌方英雄时，受害英雄附近己方小兵会 call-for-help 并短暂追击攻击者；超过 soft leash 后 aggro timer 会加速衰减，超过 hard leash 会立即脱战；多来源时会按本次伤害和距离权重判断是否切换 aggro target。
- `GameSnapshot.lane` 已暴露双方 active aggro minion count，HUD Lane chip 会显示 `Aggro N`。
- 小兵 target policy 已抽到 `src/game/simulation/minion-ai.ts`：active aggro 优先，其次敌方小兵，再敌方英雄、建筑，最后回归 lane goal。
- `src/game/simulation/last-hit.ts` 已暴露 last-hit / tower setup 窗口和 tower-shot count，`UnitSnapshot.effects` 会输出 `last-hit` / `tower-setup`，`UnitSnapshot.lastHitHint` 会输出窗口类型、需要塔伤次数和塔伤后剩余血量，Phaser healthbar 会做低血补刀和塔刀窗口高亮。
- `src/game/simulation/enemy-ai.ts` 的默认 laning fallback 已消费 lane tactical points：敌方英雄远离玩家且无 last-hit 目标时，会沿己方推进方向选择下一个 tactical point 作为对线锚点，而不是直接走向 lane 端点。
- Enemy AI 已接入 lane pressure：不利兵线下会避免 harass/all-in 并回撤到防守 tactical point；有利兵线下会保留 harass 窗口，并允许更高血量阈值的安全回城；`enemyAi.trace.reason` 会暴露 `unsafe_wave_disengage`、`safe_wave_recall`、`harass_window` 等原因。
- Enemy AI 已接入 item breakpoint recall：敌方金币达到下一件基础装备成本、兵线安全且附近没有敌方单位时，会以 `item_breakpoint_recall` 开始回城；回城完成后会用既有购买逻辑买入下一件装备，并在 scoreboard enemy row 中显示。
- Enemy AI 已接入基础 combo sequencing：Crimson harass 命中会给玩家挂短 `mark`，AI 会在安全兵线下进入 `marked_combo_attack` / `marked_combo_chase` 的 All In follow-up。
- Enemy AI 已接入基础 active item usage：持有 `haste_talisman` 时会在 marked combo window 使用 `Tempo`，持有 `guard_shield` 且中低血近战受压时会使用 `Barrier`，持有 `siege_hammer` 且有己方小兵掩护的可攻击建筑目标时会使用 `Demolish`；trace 会暴露 `combo_haste_active` / `low_health_barrier` / `siege_demolish_active`。
- Enemy AI 已接入基础 threat score：合并低血、敌塔威胁、坏兵线、局部敌/友小兵压力和玩家贴身压力；达到回撤阈值时会用 `threat_score_retreat:<reason>` trace reason 回撤到防守 tactical point。

与 LoL-like 对线策略的差距：

- lane path 已有基础 waypoints、per-unit progress、tactical points、off-path return target、稳定横向 formation offset、同队前方小兵 spacing、轻量动态 separation、Enemy AI 默认 tactical-point routing、基础 wave-state-aware trade/recall/retreat、item breakpoint recall、marked combo follow-up、基础 active item usage、Demolish 建筑目标选择和基础 threat score retreat；更细的多技能连招、更多主动道具目标优先级和更完整英雄/技能/持续伤害威胁模型仍未接入。
- 小兵已有基础 aggro memory、call-for-help、目标优先级、距离衰减、hard leash 脱战、回归 lane 和基础多目标威胁权重，但还没有持续伤害来源表或更完整的多人协作仇恨模型。
- 兵线强弱当前已基于存活单位数量、前线位置和 active aggro 细分 wave reset、slow push、freeze、crash；更细的 wave reset 后续行为仍然较粗。
- 塔下补刀已有基础高亮、tower-shot count、CS streak 和 missed CS 汇总反馈。

建议：

1. `LanePath`、per-unit lane progress、tactical points、off-path return target、基础小兵间距、稳定横向队列形态、轻量动态 separation、Enemy AI 默认 tactical-point routing、基础 wave-state-aware decision gating、item breakpoint recall、marked combo follow-up、基础 active item usage、Demolish 建筑目标选择和包含局部小兵压力的基础 threat score retreat 已完成；下一步可做多技能连招扩展、更多主动道具目标优先级或更完整的英雄/技能/持续伤害威胁模型。
2. minion call-for-help、基础 target policy、aggro distance decay 和基础多目标威胁权重已完成；下一步可继续做更细的脱战行为或持续伤害来源表。
3. lane state snapshot 和 HUD chip 已完成 wave reset / slow push / freeze / crash 细分；后续可继续增加 reset 后的 AI 决策。
4. 塔下补刀已有基础反馈、tower-shot count 和 CS summary；后续继续做更细的补刀训练节奏。

### 4.5 P1：HUD 与 gameplay 交互边界过硬耦合

证据：

- `hud.ts` 通过 `root.innerHTML` 初始化大量模板。
- UI click handler 直接调用 `window.miniLolDebug`。
- shop、scoreboard、result 部分使用 `innerHTML` 重建动态内容。

风险：

- 当前数据主要来自本地枚举和 snapshot，风险可控；但一旦加入玩家名、外部配置、存档或联网，就会变成 XSS 和状态错位风险。
- UI 无法独立测试 action dispatch，只能依赖全局 debug 对象。
- 后续移动端 HUD 会继续扩大这个文件。

建议：

1. 引入 `GameCommand` dispatcher，例如 `castSkill`、`buyItem`、`toggleShop`、`setSetting`。
2. HUD 只发送 command，不直接依赖 `window.miniLolDebug`。
3. 将 shop/scoreboard/result 行渲染改为 DOM builder 或小组件函数，避免拼接潜在外部字符串。
4. 保留 DOM HUD overlay，不把文本型 UI 塞进 canvas；这是当前正确方向。

### 4.6 P1：AI 有状态名，但缺少可解释的决策模型

当前 AI 已经能 laning、harass、retreat、all-in、recall，并会尝试 last-hit。
Enemy AI 的 sensing/context builder 已迁入 `src/game/simulation/enemy-ai.ts`：Scene 只传当前 units/buildings/wave/economy/items，AI 模块内部计算 lane pressure、tower threat、local minion pressure、siege target、safe recall 和 last-hit target。

主要差距：

- 已有基础 threat score、tower danger、wave state、局部小兵压力和 gold spend desire，但 threat score 仍是轻量模型，还没有完整英雄技能冷却、持续伤害来源和多目标威胁聚合。
- recall 已能在安全兵线和 item breakpoint 下触发，但还没有结合敌方死亡窗口、wave crash 后回推时间和技能冷却窗口。
- AI 已有 mark 后 All In follow-up、基础主动道具使用和 Demolish 建筑目标选择，但还缺少和玩家类似的多技能连招序列。

建议：

1. `enemy-ai.ts` 已承载 `sense -> score -> decide` 的主要逻辑；后续继续把 act 层 side effect 保持在 Scene bridge 内。
2. AI 输入因子已覆盖 health ratio、wave state、tower danger、item breakpoint、local minion pressure 和 siege target；后续可加入 player cooldown window 和更多英雄威胁来源。
3. 增加 AI 可调参数：aggression、lastHitStrictness、recallDiscipline、towerRespect。
4. 给 AI 决策写 snapshot trace，方便 playtest 中看到它为什么 retreat 或 all-in。

### 4.7 P2：缺少视野、草丛和地图信息战

当前地图是完全可见的单线战场，小地图显示单位和建筑。

这对 MVP 可以接受，但下一阶段如果要更像 MOBA，需要最低限度的信息层次：

1. 先不做完整 fog of war。
2. 先做 brush/ambush zone，占位规则为：进入草丛时非近距离敌方单位不显示攻击意图。
3. 小地图先支持 “visible/unknown” 状态，而不是全量精确点位。
4. 后续再考虑 ward、neutral objective 和 jungle。

### 4.8 P2：装备与经济还缺少 build choice

当前装备都是一次性购买，部分带 active item。

建议：

1. 保留 MVP 无合成树，但增加互斥路线：damage、survivability、haste、siege。
2. 给 enemy AI 也增加基础购买逻辑，否则玩家经济优势缺少对手反馈。
3. 增加 item stat recalculation，避免购买时直接累加导致卖出、重置、难度修正困难。

## 5. 更新路线图

### Phase 1：系统边界重构

目标：不改变玩法表现，先降低架构风险。

修改范围：

| 文件/目录 | 动作 |
| --- | --- |
| `src/game/simulation/types.ts` | 新建 simulation state 类型，承载 Unit、Building、GameMode、CombatEvent |
| `src/game/data/game-config.ts` | 新建集中数值配置 |
| `src/game/debug-api.ts` | 从 Scene 中迁出 `window.advanceTime`、`window.render_game_to_text` 和 `window.miniLolDebug` debug/test adapter |
| `src/game/simulation/active-items.ts` | 从 Scene 中迁出 active item effect draft、mana restore、shield、haste 和 demolish target damage draft |
| `src/game/simulation/combat.ts` | 从 Scene 中迁出 attack damage event creation、damage event drain、source validation、hit geometry 和 hp/shield resolution |
| `src/game/simulation/commands.ts` | 从 Scene 中迁出 move/attack command state assignment 和 player attack-command decision |
| `src/game/simulation/economy.ts` | 从 Scene 中迁出 XP/gold reward、enemy last-hit economy、catalog purchase validation、item stat application 和 active slot lookup |
| `src/game/simulation/enemy-ai.ts` | 承载 Enemy AI decision、trace、threat score、active item target selection 和 decision input builder |
| `src/game/simulation/player-skills.ts` | 从 Scene 中迁出 Q/W/E/R skill cast event draft creation 和 skill attempt failure 判断 |
| `src/game/simulation/towers.ts` | 从 Scene 中迁出 tower aggro、targeting 和 tower attack intent |
| `src/game/simulation/unit-lifecycle.ts` | 从 Scene 中迁出 crowd-control cleanup、hero death prep 和 respawn reset |
| `src/game/simulation/snapshot.ts` | 从 simulation state 生成 `GameSnapshot` |
| `src/game/MobaScene.ts` | 保留 Phaser lifecycle、renderer/input bridge，逐步删除规则所有权 |
| `src/game/types.ts` | 保留 UI/test-facing snapshot contract |

验收标准：

- `npm run build` 通过。
- 现有 `playtest-artifacts/completion-round-5/report.json` 对应的断言能力仍可重跑并通过。
- `MobaScene.ts` 行数目标是下降到 1800 行以下。当前为 1745 行，已从审计基线 2879 行下降并重新满足该门槛；后续继续接入 AI/tower/lane 编排时仍应优先拆 Scene orchestration。
- 纯 simulation 函数至少覆盖：damage resolution、damage event dispatch、area damage application、ability damage side effects、building damage application、XP/gold reward、skill attempt failure、skill cast state application、queued skill state application、active item use gate、active item use application、building vulnerability、nearest enemy targeting、pointer target picking、cooldown ticking、queued skill tick、modal state transitions、keyboard input decisions、pointer input decisions、player input tick actions、movement input decisions、target point movement decisions、attack command application、player input block decisions、player action start decisions、aim preview decisions、unit movement、direction fallback vector、visible unit action、unit status tick、base recovery、recall channel begin、recall channel tick 和 enemy decision input builder。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖。

### Phase 2：兵线与防御塔深化

目标：让对线从“单位互打”升级为“玩家可以理解和利用兵线/塔节奏”。

修改内容：

1. 增加 lane waypoint 与 lane progress。
2. 增加 minion aggro memory 和 call-for-help。
3. 增加 tower target priority。
4. 增加 champion tower ramping threat。
5. 增加无己方 minion 附近时的 structure damage penalty。
6. 增加 lane state snapshot 与 HUD status chip。

验收标准：

- 玩家攻击塔下敌方英雄时，敌塔切换攻击玩家。
- 敌方英雄离开塔范围或死亡后，塔重新按优先级选择目标。
- siege minion 比 melee/caster 更优先承受塔火力。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖。
- forced hero aggro 下，防御塔连续攻击同一英雄的伤害递增。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖。
- 无兵线普攻拆塔明显更慢。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖 structure damage penalty。
- 玩家进入敌塔范围时能在 snapshot/HUD 中看到 tower danger；无己方小兵时显示 no minion cover。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 和 `playtest-artifacts/phase-2-tower-danger-indicator-smoke/report.json` 覆盖。
- lane state 能在 debug snapshot 中稳定出现，并在 HUD chip 中展示。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 和 `playtest-artifacts/phase-2-lane-state-indicator-smoke/report.json` 覆盖。
- lane path projection 和 per-unit `laneProgress` 能在 snapshot 中稳定出现，小兵无目标时使用 lane path look-ahead target 推进。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 和 `playtest-artifacts/phase-2-lane-path-indicator-smoke/report.json` 覆盖。
- lane tactical point 能在 snapshot 中稳定出现，当前锚点为 `azure_outer`、`mid_lane`、`crimson_outer`。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖，并由 `playtest-artifacts/phase-2-lane-tactical-indicator-smoke/report.json` 做浏览器 fixture 回归。
- Enemy AI 默认对线 fallback 会选择己方推进方向上的下一个 lane tactical point，而不是直接朝 lane 端点移动。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖，并由 `playtest-artifacts/phase-2-enemy-tactical-routing-indicator-smoke/report.json` 做浏览器 fixture 回归。
- Enemy AI 会读取 lane pressure：不利兵线下会用 `unsafe_wave_disengage` trace reason 回撤，有利兵线下仍会保留 `harass_window`，安全兵线允许 `safe_wave_recall`。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖，并由 `playtest-artifacts/phase-2-enemy-wave-aware-indicator-smoke/report.json` 做浏览器 fixture 回归。
- Enemy AI 达到下一件装备金币阈值时，会在安全兵线窗口以 `item_breakpoint_recall` 回城；回城完成后会购买下一件基础装备并同步到 scoreboard enemy row。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖，并由 `playtest-artifacts/phase-2-enemy-item-recall-indicator-smoke/report.json` 做浏览器 fixture 回归。
- Enemy AI harass 命中后会给玩家挂 `marked`，随后在安全兵线下进入 All In follow-up，并通过 `marked_combo_attack` / `marked_combo_chase` trace reason 解释。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖，并由 `playtest-artifacts/phase-2-enemy-combo-indicator-smoke/report.json` 做浏览器 fixture 回归。
- Enemy AI 持有主动道具时会在明确窗口使用：`haste_talisman` 用于 marked combo，`guard_shield` 用于中低血近战受压，`siege_hammer` 用于有小兵掩护的可攻击建筑目标。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖，并由 `playtest-artifacts/phase-2-enemy-active-item-indicator-smoke/report.json` 与 `playtest-artifacts/phase-2-enemy-siege-active-indicator-smoke/report.json` 做浏览器 fixture 回归。
- Enemy AI 会把低血、敌塔威胁、坏兵线、局部敌/友小兵压力和玩家贴身压力合成基础 threat score；超过阈值时用 `threat_score_retreat:<reason>` 回撤。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖，并由 `playtest-artifacts/phase-2-enemy-threat-score-indicator-smoke/report.json` 与 `playtest-artifacts/phase-2-enemy-minion-pressure-indicator-smoke/report.json` 做浏览器 fixture 回归。
- 小兵无目标推进时会避免继续挤压同队前方过近小兵；基础队列间距由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖，并由 `playtest-artifacts/phase-2-minion-lane-spacing-indicator-smoke/report.json` 做浏览器推进回归。
- 小兵偏离 lane path 且无战斗目标时，会先回最近的 path projection，再继续 look-ahead 推进。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖，并由 `playtest-artifacts/phase-2-lane-return-indicator-smoke/report.json` 做浏览器推进回归。
- 小兵 lane target 会带稳定横向 formation offset，避免无目标推进时全部收敛到中心线。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖，并由 `playtest-artifacts/phase-2-lane-formation-indicator-smoke/report.json` 做浏览器推进回归。
- 小兵无目标推进目标会叠加短距离 separation vector，减轻近距离同队重叠。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖，并由 `playtest-artifacts/phase-2-minion-separation-indicator-smoke/report.json` 做浏览器推进回归。
- 英雄攻击敌方英雄时，附近敌方小兵会短暂 call-for-help 并追击攻击者。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 和 `playtest-artifacts/phase-2-minion-aggro-indicator-smoke/report.json` 覆盖。
- 小兵 call-for-help 对多来源英雄伤害会按伤害量和距离生成 threat score；低威胁来源不会抢走当前 aggro，高威胁来源会切换目标。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖，并由 `playtest-artifacts/phase-2-minion-aggro-threat-indicator-smoke/report.json` 做浏览器回归。
- 小兵普通策略会优先攻击敌方小兵；active aggro 会覆盖普通策略；无目标时回归 lane goal。当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 和 `playtest-artifacts/phase-2-minion-policy-indicator-smoke/report.json` 覆盖。

### Phase 3：补刀与成长反馈

目标：强化 LoL-like laning 的核心学习点。

修改内容：

1. 低血敌方 minion 增加 last-hit window 高亮。
2. 增加 missed CS 反馈，但不要刷屏。
3. 补刀金币、经验、升级、技能点、装备购买形成连续 HUD 动效。
4. 调整 tower damage to minion，使塔下补刀出现稳定节奏。
5. 增加 simple post-game economy summary：CS、missed CS、gold spent、tower damage。

验收标准：

- 玩家能通过视觉提示判断哪个 minion 可补。
- 塔下 melee/caster/siege 有可学习的补刀节奏。
- Playwright 断言能验证 last-hit gold、missed CS、level up、purchase 后 stats 改变。

### Phase 4：AI 对线升级

目标：让 Crimson Duelist 更像对线对手，而不是移动靶。

修改内容：

1. 拆出 AI decision module 和 decision input builder。
2. 扩展 threat score 和 wave state 感知。
3. 增加 item breakpoint recall。
4. 增加基本 skill combo：harass、mark、all-in。
5. 增加 AI decision trace 到 snapshot。

验收标准：

- AI 在低血、被塔威胁、wave 不利或局部敌方小兵过多时撤退。基础 threat score retreat 当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖，并由 `playtest-artifacts/phase-2-enemy-threat-score-indicator-smoke/report.json` 与 `playtest-artifacts/phase-2-enemy-minion-pressure-indicator-smoke/report.json` 做浏览器 fixture 回归。
- AI 在玩家低血、关键技能冷却可用时尝试 all-in。
- AI 在攒够装备钱且 wave 状态安全时回城。
- AI 行为可通过 snapshot trace 解释；decision input builder 当前由 `playtest-artifacts/phase-1-simulation-unit/assertions.mjs` 覆盖，并由 `playtest-artifacts/phase-2-enemy-context-builder-siege-regression/report.json` 做浏览器回归。

### Phase 5：HUD 输入边界与安全整理

目标：让 DOM HUD 成为稳定 UI 层，而不是 debug hook 的直接客户端。

修改内容：

1. 新增 `GameCommand` 类型与 command dispatcher。
2. HUD click handler 发送 command，Scene/simulation 处理 command。
3. shop/scoreboard/result 改成安全 DOM builder 或明确的 trusted renderer。
4. 为移动端 HUD 预留 command/action map，不直接绑定键盘语义。

验收标准：

- 删除 HUD 对 `window.miniLolDebug` 的生产路径依赖。
- debug hooks 只用于测试和开发控制。
- `innerHTML` 只保留静态 trusted template，动态列表不用字符串拼接外部值。
- 所有 HUD 操作仍能被 Playwright 调用验证。

### Phase 6：地图信息层与目标扩展

目标：增加 MOBA 纵深，但不破坏单线 MVP。

建议顺序：

1. Brush zone，占位隐藏/显形规则。
2. 小地图 visible/unknown 状态。
3. Neutral camp 占位，用于练习 objective timing。
4. Inhibitor/super minion 简化机制。
5. 可选 jungle side lane，不急于做三路地图。

验收标准：

- 玩家能因为 brush 和 minimap 信息做位置决策。
- 摧毁 inhibitor 后，该路后续 wave 追加 super minion。
- 目标扩展不会让单局时长失控。

### Phase 7：资产生产流水线固化

目标：把后续美术资产生产变成可追溯、可校验、可复用的项目流水线。

修改内容：

1. 为 `assets/sprites/characters/`、`assets/sprites/minions/`、`assets/sprites/effects/`、`assets/sprites/ui/` 建立统一 manifest 约定。
2. 使用 `.codex/skills/game-character-sprites` 生成或修正角色、小兵动作精灵图。
3. 使用 `.codex/skills/codex-gateway-imagegen` 生成概念图、参考图和静态 raster asset。
4. 把每次生成的 source、prompt、manifest、validation、preview 放入对应资产目录。
5. 在 `src/game/assets.ts` 只引用稳定 manifest key，不直接散落临时生成路径。

验收标准：

- 每个新增 sprite run 都有 `run-manifest.json`。
- 每个动作 sheet 都有 clean PNG、metadata、contact sheet、validation JSON 和 GIF/WebP 预览。
- 新增 raster 图像都能追溯到 gateway 输出路径和项目内落位路径。
- `npm run build` 能正常打包所有新增资产。

## 6. 推荐执行顺序

| 优先级 | 任务 | 理由 |
| --- | --- | --- |
| 1 | Phase 1 系统边界重构 | 先降低 God Object 风险，后续所有机制都会更好测 |
| 2 | Phase 2 兵线与防御塔深化 | 最接近 LoL 对线核心，也直接提升可玩性 |
| 3 | Phase 3 补刀与成长反馈 | 让玩家理解自己为什么领先或落后 |
| 4 | Phase 4 AI 对线升级 | 当前 AI 已可用，但缺少策略解释和经济回补 |
| 5 | Phase 5 HUD 输入边界 | 为移动端和安全性清债 |
| 6 | Phase 6 地图信息层 | 价值高，但应等核心单线体验稳定后再扩 |
| 7 | Phase 7 资产生产流水线固化 | 确保后续美术生成可追溯、可校验、可重复 |

## 7. 建议新增测试矩阵

| 测试类别 | 覆盖点 |
| --- | --- |
| Pure simulation unit tests | damage、shield、mark consume、cooldown refund、XP/gold、respawn duration、building vulnerability |
| Tower behavior assertions | hero aggro、target reset、siege priority、no-minion tower damage penalty |
| Lane behavior assertions | wave spawn、lane state、minion aggro memory、return-to-lane |
| Economy assertions | last-hit gold、nearby XP、missed CS、item stat recalculation、AI purchase |
| HUD command assertions | cast、upgrade、buy、use item、toggle settings、scoreboard、recall |
| Browser smoke | nonblank canvas、HUD not overlapping、shop/scoreboard/death/result visible states |

## 8. 近期不建议做的事

1. 不建议立刻做完整三路地图。当前单线系统边界还没拆清，三路会把状态复杂度放大。
2. 不建议立刻复制 LoL 具体英雄、技能名、图标、数值或地图资产。项目应保持原创。
3. 不建议先做复杂装备合成树。当前更缺的是 item stat recalculation 和 AI 经济反馈。
4. 不建议把 HUD 全塞进 canvas。DOM HUD 对文字、设置、商店、计分板更合适。
5. 不建议删除现有 Playwright/debug hooks。应该先改造成明确的 dev/test adapter。
6. 不建议绕过 `.codex/skills/game-character-sprites` 直接手工拼角色 sprite sheet。
7. 不建议绕过 `.codex/skills/codex-gateway-imagegen` 把生图结果只保存在临时目录或聊天输出中。

## 9. 外部链接

- Riot 官方玩法入门：https://www.leagueoflegends.com/en-us/how-to-play/
- Leaguepedia Minions and Towers：https://lol.fandom.com/wiki/New_To_League/Gameplay/Minions_and_Towers
- MOBAFire Last Hitting：https://www.mobafire.com/league-of-legends/wiki/game-mechanics/last-hitting
- MOBAFire Turret：https://www.mobafire.com/league-of-legends/wiki/maps/turret
- Phaser repository：https://github.com/phaserjs/phaser
