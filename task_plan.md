# Task Plan: Deno Deploy 加载体验与资源优化

## Goal
让 mini-lol 部署到 Deno Deploy 后首屏更快可见、加载过程不卡死，并减少图片资源体积与静态资源加载阻塞。

## Current Phase
Phase 1

## Phases

### Phase 1: Requirements & Discovery
- [x] 捕获用户目标：分析优化点并开始实施
- [x] 检查上次会话 catchup、当前 diff 和已有计划文件
- [ ] 使用 agent team 并行分析前端首屏、资源体积、Deno Deploy 缓存部署风险
- **Status:** in_progress

### Phase 2: Technical Plan
- [ ] 汇总 agent 发现，确定低风险实施范围
- [ ] 决定骨架屏、图片格式、资源压缩、缓存策略的最小可行改动
- **Status:** pending

### Phase 3: Implementation
- [ ] 添加或改进首屏骨架屏/加载态，避免空白卡顿
- [ ] 增加图片格式转换和无损压缩工作流
- [ ] 调整静态资源缓存/预加载/懒加载策略
- **Status:** pending

### Phase 4: Testing & Verification
- [ ] 运行构建和静态检查
- [ ] 启动本地预览并用浏览器验证首屏加载体验
- [ ] 检查关键资源体积和产物路径
- **Status:** pending

### Phase 5: Delivery
- [ ] 汇总修改点、验证结果和 Deno Deploy 注意事项
- [ ] 明确未改动的既有用户变更
- **Status:** pending

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

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `task_plan.md` 和 `findings.md` 不存在 | 1 | 创建本次任务专用计划和发现文件 |
| 直接读取现有 `progress.md` 超出 token 限制 | 1 | 改为统计行数并只读取尾部，避免覆盖历史内容 |

## Notes
- 不要修改无关的角色 prompt 和未跟踪图片，除非后续明确属于资源优化范围。
- 优先做不会改变玩法逻辑的加载体验和资源管线优化。
