# MOBA HUD 低遮挡调研与落地记录

## 直接结论

当前 Mini LoL HUD 的主要问题不是单个面板过大，而是信息常驻层太多：左上目标面板、左下玩家状态、右上小地图、右下技能与装备、底部消息同时压在战场上。更合理的策略是保留少量边缘常驻信息，把中心和下中部留给操作，把商店、计分板、设置、进阶统计放到按需展开或更低权重的状态里。

## 调研依据

- LoL 的界面设置提供 HUD Scale、Shop Scale、Minimap Scale，说明核心 HUD、商店、小地图都需要独立缩放，而不是固定占用同一套尺寸。
- LoL 的能力与攻击显示项允许关闭目标框、攻击范围、线性技能指示、HUD 技能点击等，说明战斗辅助信息应可降低常驻程度。
- LoL 的小地图设置支持左右位置和是否允许小地图移动指令，说明小地图是重要信息源，但也需要位置与误操作边界。
- LoL 商店可以从地图任意位置查看，但购买仍受基地/商店范围约束。这适合把商店做成按需面板，而不是常驻列表。
- Dota 2 的 HUD 重做明确目标是缩小顶部栏和英雄控制面板占屏面积，让玩家获得更多地图视野；小地图也提供简化背景和可调尺寸。
- Dota 2 设置中有简化小地图、额外大地图、右侧小地图、英雄图标尺寸等选项，说明小地图的信息密度和尺寸应是可控的。
- Phaser 3.90 侧，Context7 与 DeepWiki 都指向同一个架构判断：游戏画布使用 ScaleManager 处理尺寸，HUD 可用 DOM 层承载，但必须用 pointer-events 和显式尺寸管理输入边界，避免 DOM HUD 与画布输入互相抢事件。

## 对本项目的落地原则

1. 常驻 HUD 预算收缩：正常对局只保留顶部比分、紧凑玩家状态、技能条、装备快捷栏、小地图、短消息。
2. 中心和下中部让给战场：状态消息从底部中心移到顶部比分下方，技能条缩小并居中贴底。
3. 小地图移出交战热点：从右上移到右下边角，避免遮住当前截图里的右侧防御塔和兵线路径。
4. 商店与装备拆分：保留底部一行装备快捷栏，完整商店仍只在打开时出现。
5. 进阶统计降权：经验、连补、漏刀、技能点继续保留 DOM 节点和数据更新，但默认不常驻显示，避免左下状态面板膨胀。
6. 移动端和窄屏单独处理：窄屏下小地图回到顶部右侧，装备栏上移，避免与底部技能条重叠。

## 本次代码改动

- `src/ui/hud.ts`：给经验、连补、漏刀、技能点增加 `secondary-stat` 分组，保留数据更新能力，但默认不常驻显示。
- `src/styles.css`：缩小顶部比分、左下玩家状态、技能按钮、装备按钮、小地图、目标面板；重新定位小地图、状态消息、装备快捷栏；补充窄屏布局规则。

## 参考来源

- League of Legends settings: https://leagueoflegends.fandom.com/wiki/Settings_(League_of_Legends)
- League of Legends shop: https://leagueoflegends.fandom.com/wiki/Shop
- Riot support FPS/interface guidance: https://support-leagueoflegends.riotgames.com/hc/en-us/articles/201752684-Low-Frame-Rate-FPS-Troubleshooting
- Dota 2 HUD redesign: https://www.dota2.com/700/hud/?l=schinese
- Dota 2 game settings: https://dota2.fandom.com/wiki/Game_settings
- Phaser documentation via Context7: `/phaserjs/phaser/v3_90_0`
- DeepWiki query: https://deepwiki.com/search/for-phaser-3-games-what-are-th_f9d6741c-2e35-4473-ba48-8db3b3c4d146
