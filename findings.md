# Findings & Decisions

## Requirements
- 分析 mini-lol 项目部署到 Deno Deploy 后可能出现的加载卡顿点。
- 实施首屏体验优化，例如骨架屏、加载态，避免用户看到长时间空白。
- 实施图片资源优化，例如格式转换、无损压缩、资源体积检查。
- 检查并改进静态资源缓存、预加载、懒加载等部署相关策略。
- 用户明确要求使用 agent team 开始实施。

## Research Findings
- 初始 git 状态已有未跟踪图片：`assets/sprites/characters/nie_feng/run/64/generated/idle-north.png`、`assets/sprites/characters/nie_feng/run/source/64-idle-north.png`。
- 初始 `git diff --stat` 显示 5 个 `assets/sprites/characters/nie_feng/run/64/prompts/*.txt` 文件已有改动；本任务要避免误覆盖这些既有改动。
- `task_plan.md` 和 `findings.md` 原本不存在；`progress.md` 已存在且历史内容很长。
- `index.html` 当前只有 `#game-root` 和 `#hud-root`，没有 HTML/CSS 级别的首屏骨架屏；JS bundle 执行前用户只能看到页面背景。
- `vite.config.ts` 使用 `publicDir: "assets"`，意味着 `assets` 下的图片会作为静态资源复制到部署产物根路径。
- `package.json` 当前脚本只有 `dev`、`build`、`preview`、`test:mvp`，没有图片压缩或资源体积统计脚本。
- 项目根目录没有 `deno.json`，需要继续查找 Deno Deploy 入口或自定义服务器文件。
- `server.ts` 直接从 `dist` 读文件返回，只设置 `content-type`，当前没有 `Cache-Control`、`ETag`、`content-length`，hashed Vite 资源无法被浏览器长期缓存。
- `server.ts` 的 SPA fallback 只在 `Accept` 包含 `text/html` 时返回 `index.html`，资源路径失败时通常会 404，不太会把图片错误回退成 HTML；这是安全的。
- `src/main.ts` 先 `initHud()` 后 `new Phaser.Game(...)`，所以 HUD 会比 Phaser 资源加载和 Scene create 更早显示；截图现象与这条链路一致。
- `MobaScene.preload()` 一次性加载所有单位动作 sheet、所有建筑状态、地图背景和 VFX atlas，当前没有加载进度 UI、加载错误 UI 或完成后通知 DOM 隐藏骨架屏。
- 关键根因发现：`src/game/assets.ts` 当前玩家 `nie_feng` 需要 `assets/sprites/characters/nie_feng/run/64/final/{idle,move,basic_attack,cast,hit,death}-sheet-clean.png`，但该目录目前只有 `idle-north-test-*`，没有运行时需要的 final sheet。部署后这些请求会 404，Phaser 仍可能启动并显示 HUD/绿色背景，但角色和动画无法正常出现。
- 地图背景 `assets/maps/single_lane_rift/final/single-lane-rift-background.png` 存在，大小约 2.9MB，是首屏最重资源之一，适合生成 WebP 版本并保留 PNG fallback。
- `src/game/assets.ts` 通过 `import.meta.env.BASE_URL` 拼接静态资源路径，Vite `publicDir: "assets"` 会把 `assets/...` 里的实际 URL 映射为部署根路径下的相对资源。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 并行派发前端体验、资源管线、部署缓存三类分析 | 三类问题相对独立，适合 agent team 并行缩短诊断时间 |
| 骨架屏优先考虑 HTML/CSS 层 | HTML/CSS 层在 JS bundle 下载和执行前即可显示，最能改善“空白卡住”的体感 |
| 图片优化先以构建脚本/资源管线为主 | 避免手工改大量图片导致不可追踪，后续可稳定复用 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 现有 `progress.md` 过大，不能一次性读取 | 只读取尾部并用 Edit 追加本次记录 |

## Resources
- Project root: `/Users/zhangjinhui/Desktop/mini-lol`
- Planning files: `task_plan.md`, `findings.md`, `progress.md`

## Visual/Browser Findings
- 正常 Vite 预览 `http://127.0.0.1:4174/` 验证：`#loading-shell` 在 `mini-lol:ready` 后隐藏，canvas 为 1280x720，控制台无 warning/error，运行时 WebP 请求均返回 200。
- 慢图片加载模拟验证：资源延迟时 `#loading-shell:not(.is-hidden)` 可见，显示“正在进入峡谷”和进度/状态文本，不再是空白或只有 HUD。
- Deno 静态入口 `http://127.0.0.1:8000/` 验证：HTML 返回 `cache-control: no-cache`；hashed JS 返回 `public, max-age=31536000, immutable`；地图 WebP 返回 `image/webp` 和 `public, max-age=86400, stale-while-revalidate=604800`。

## Final Implementation Notes
- 新增 HTML 内联骨架屏和加载进度 DOM：`index.html`。
- `src/main.ts` 监听 `mini-lol:loading-progress`、`mini-lol:loading-file`、`mini-lol:loading-error`、`mini-lol:ready`，负责更新和隐藏骨架屏。
- `src/game/MobaScene.ts` 在 Phaser preload/create 阶段发出加载进度、文件、错误和 ready 事件。
- `src/game/assets.ts` 运行时优先把 PNG URL 改成 WebP URL；浏览器不支持 WebP 时回退 PNG。
- `scripts/optimize-runtime-assets.mjs` 统计 runtime final PNG，并用 `cwebp -lossless -z 9` 生成 WebP 镜像；本次生成 236 个 WebP，runtime PNG 约 31.95MB，对应 WebP 约 20.96MB。
- `server.ts` 增加 `Cache-Control`、`Content-Length`、`X-Content-Type-Options` 和更多 content-type。
- 发现 `nie_feng` final 动作 sheet 不完整；当前运行时避免请求不存在的 `nie_feng` 动作 sheet，防止部署后 Phaser 资源 404 导致主画面长期空绿。

---
*Update this file after every 2 view/browser/search operations*
*This prevents visual information from being lost*
