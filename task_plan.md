# Task Plan: Deno Deploy 加载体验与资源优化

## Goal
让 mini-lol 部署到 Deno Deploy 后首屏更快可见、加载过程不卡死，并减少图片资源体积与静态资源加载阻塞。

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] 捕获用户目标：分析优化点并开始实施
- [x] 检查上次会话 catchup、当前 diff 和已有计划文件
- [x] 使用 agent team 并行分析前端首屏、资源体积、Deno Deploy 缓存部署风险
- **Status:** complete

### Phase 2: Technical Plan
- [x] 汇总 agent 发现，确定低风险实施范围
- [x] 决定骨架屏、图片格式、资源压缩、缓存策略的最小可行改动
- **Status:** complete

### Phase 3: Implementation
- [x] 添加或改进首屏骨架屏/加载态，避免空白卡顿
- [x] 增加图片格式转换和无损压缩工作流
- [x] 调整静态资源缓存/预加载/懒加载策略
- **Status:** complete

### Phase 4: Testing & Verification
- [x] 运行构建和静态检查
- [x] 启动本地预览并用浏览器验证首屏加载体验
- [x] 检查关键资源体积和产物路径
- **Status:** complete

### Phase 5: Delivery
- [x] 汇总修改点、验证结果和 Deno Deploy 注意事项
- [x] 明确未改动的既有用户变更
- **Status:** complete

## Key Questions
1. 当前首屏卡顿主要来自 JS 初始化、图片解码、资源数量，还是 Deno Deploy 缓存/冷启动？
2. 哪些图片资源适合转换为 WebP/AVIF，同时不破坏 Phaser/Canvas 加载？
3. 骨架屏应该放在 HTML/CSS 层，还是 React/Vite 应用层？
4. Deno Deploy 静态文件响应是否已经设置了合理的 Cache-Control？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 使用 agent team 并行分析 | 用户明确要求使用 agent team，且任务涉及前端体验、资源优化、部署缓存多个方向 |
| 先保留已有未提交资源变更 | `git status` 起始状态包含未跟踪图片，`git diff --stat` 显示 prompt 文件已有改动，必须避免误覆盖用户工作 |
| 计划文件放项目根目录 | planning-with-files 技能要求本次复杂任务使用 `task_plan.md`、`findings.md`、`progress.md` |
| 使用 HTML 内联骨架屏 | JS/CSS/Phaser 尚未完成前也能显示，不再让用户看到空白或只有 HUD 的空场景 |
| 运行时 PNG 优先加载 WebP | 236 个 final PNG 生成 lossless WebP 镜像，运行时自动使用 WebP，浏览器不支持时回退 PNG |
| Deno 静态响应增加缓存头 | `index.html` 不缓存，Vite hashed assets 长缓存 immutable，图片资源短缓存加 stale-while-revalidate |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `task_plan.md` 和 `findings.md` 不存在 | 1 | 创建本次任务专用计划和发现文件 |
| 直接读取现有 `progress.md` 超出 token 限制 | 1 | 改为统计行数并只读取尾部，避免覆盖历史内容 |
| 临时 Python 资源检查脚本使用了 JS 正则语法 | 1 | 改成纯 Python 路径替换后检查通过 |
| Playwright 慢网模拟路由定时器报错 | 1 | 改用结果验证骨架屏可见，并重新开干净标签确认应用无 warning/error |
| 核心模拟断言仍期待旧 Astra 技能文案 | 1 | 更新断言到当前风雪刀客技能文案后通过 |

## Notes
- 不要修改无关的角色 prompt 和未跟踪图片，除非后续明确属于资源优化范围。
- 优先做不会改变玩法逻辑的加载体验和资源管线优化。
