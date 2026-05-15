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
- 尚未进行浏览器验证。

---
*Update this file after every 2 view/browser/search operations*
*This prevents visual information from being lost*
