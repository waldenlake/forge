# Implementation Plan — Forge Context 管理

## Overview

按设计文档 `2026-06-04-context-management-design.md` 的三层结构 + 插件化拆解。共 30 个 task,按 Phase 1-5 推进,每个 task 含明确文件路径、TDD 步骤、关联 requirements。

执行顺序:第 1 层(跨平台通用)→ 第 2 层(种子注入)→ 第 3 层(插件 + 两条链路)→ 验证。第 1 层即使不装插件也立即生效(Requirement 8.1 的核心保证)。

## Tasks

### Phase 1:跨平台通用机制(无平台依赖,立即收益)

- [x] 1. 加 .forge/reports 目录管理 + reset 处理
  - 文件:`cli/src/state/progress.ts`、`cli/src/commands/reset.ts`
  - RED:测试 `forge reset --backup` 后 `.forge/reports/` 被纳入备份并清空
  - GREEN:在 reset 流程中加入 reports 目录归档
  - REFACTOR:抽出 reports 路径常量
  - **Validates:** Requirement 1.4

- [ ] 2. forge test --summarize 命令(测试输出落盘)
  - 文件:`cli/src/commands/test.ts`、`cli/test/test-summarize.test.ts`
  - RED:测试运行 vitest/pytest profile 时,完整输出写入 `.forge/reports/test-<ISO>.log`,JSON 返回 `{passed, failed, skipped, duration_ms, failures[≤5], report_path}`,每个 failure 的 error 截断到 200 字符
  - GREEN:在现有 `test` 命令上加 `--summarize` 标志,使用 spawnSync 捕获 stdout/stderr,解析框架特定的输出格式提取计数,落盘 + JSON 返回
  - REFACTOR:把 framework-specific 解析(vitest/pytest/cargo)抽到 `lib/test-parsers/`
  - **Validates:** Requirements 1.1, 1.2

- [~] 3. forge verify --summarize 命令
  - 文件:`cli/src/commands/verify.ts`
  - RED:测试 `verify --summarize` 把完整 report 写入 `.forge/reports/verify-<ISO>.json`,只返回结构化摘要
  - GREEN:扩展现有 verify 流水线,添加 summarize 标志,完整 verification report 落盘 + 摘要返回
  - REFACTOR:与 test --summarize 共用落盘 helper
  - **Validates:** Requirement 1.3

- [~] 4. forge_executing SKILL.md 主线程禁令规则块
  - 文件:`skills/forge_executing/SKILL.md`
  - RED:N/A(纯文档)
  - GREEN:在 SKILL.md 顶部加 ⛔ 规则块,明确禁令(edit/write/patch、读源码、bash 跑测试)+ 允许工具白名单
  - REFACTOR:把 ⛔ 块格式抽到 SKILL-UX.md 作为公共模板
  - **Validates:** Requirements 1.5, 2.1, 2.2

- [~] 5. subagent-driven-development 返回格式契约
  - 文件:`skills/forge_executing/SKILL.md`(D2 派发 prompt 拼接逻辑)
  - RED:测试派发给 subagent 的 prompt 末尾包含强制返回格式块(STATUS/COMMIT/REPORT/SUMMARY)
  - GREEN:在 D2 步骤的 prompt 模板末尾追加格式契约文本
  - REFACTOR:把契约模板抽成 skill 共享 fragment
  - **Validates:** Requirements 3.1, 3.2

- [~] 6. 主线程对 subagent 返回的最小解析
  - 文件:`skills/forge_executing/SKILL.md`、`skills/SKILL-UX.md`
  - RED:N/A(skill 文档约束)
  - GREEN:在 SKILL.md 中明确"主线程只解析 4 个字段、不主动读 REPORT 路径"
  - REFACTOR:补到 SKILL-UX.md 作为通用规范
  - **Validates:** Requirements 3.3, 3.4

- [~] 7. handoff.md schema + writer
  - 文件:`cli/src/lib/handoff.ts`(新)、`cli/test/handoff.test.ts`
  - RED:测试 `writeHandoff(progress)` 生成的 markdown 包含全部必需字段(feature/status/tasks/last_task/next_task/spec_path/plan_path/generated_at/Resume command)
  - GREEN:实现 writer,从 progress.json 计算字段,完整重写 `.forge/handoff.md`(不追加)
  - REFACTOR:抽出字段提取逻辑
  - **Validates:** Requirements 4.1, 4.2

- [~] 8. forge handoff:get 命令
  - 文件:`cli/src/commands/handoff.ts`(新)、`cli/src/index.ts`
  - RED:测试 `forge handoff:get` 读取 handoff.md 内容并 echo;handoff.md 不存在时从 progress.json 实时重建后输出
  - GREEN:实现命令,注册到 program
  - REFACTOR:与 Task 7 共用 writer
  - **Validates:** Requirements 4.3, 4.4

- [~] 9. task:done 自动维护 handoff
  - 文件:`cli/src/commands/task.ts`、`cli/test/task-done-handoff.test.ts`
  - RED:测试 `task:done` 完成后 `.forge/handoff.md` 反映最新状态(完成的 task 出现在 last_task,下一个 pending 在 next_task)
  - GREEN:在 task:done 流程末尾调用 writeHandoff()
  - REFACTOR:错误处理——handoff 写失败不阻断 task:done,记录 warning
  - **Validates:** Requirement 4.1, 4.5(部分)

- [~] 10. forge audit 扩展 handoff/progress 一致性检查
  - 文件:`cli/src/commands/audit.ts`、`cli/test/audit-handoff-drift.test.ts`
  - RED:测试 audit 在 handoff.md 字段与 progress.json 不一致时报告 drift,提供 `forge handoff:write` 重建建议
  - GREEN:在 audit 流程加入 handoff 一致性检查
  - REFACTOR:共用字段比对工具
  - **Validates:** Requirement 4.5

- [~] 11. phase:finish 归档 handoff
  - 文件:`cli/src/commands/phase.ts`
  - RED:测试 `phase:finish` 后 handoff.md 被清空或归档(与 scenarios.json 归档处理一致)
  - GREEN:在 phase:finish 流程加入 handoff 归档/清空
  - REFACTOR:与 scenarios:archive 共用归档逻辑
  - **Validates:** Requirement 4.6

### Phase 2:跨平台 context 占用读取(插件决策基础)

- [~] 12. OpenCode SQLite 读取适配器
  - 文件:`cli/src/lib/context-readers/opencode.ts`(新)、`cli/test/context-readers-opencode.test.ts`
  - RED:用一个 fixture SQLite(模拟 OpenCode opencode.db),测试读取最新 assistant message 返回 `tokens.input + tokens.cache.read`,且 cwd 匹配 `directory` 列定位 session
  - GREEN:用 bun:sqlite 或 better-sqlite3 实现读取,封装 `readOpencodeUsage(cwd, sessionId?)`
  - REFACTOR:抽出 SQL 常量
  - **Validates:** Requirements 10.2, 10.4

- [~] 13. Claude Code JSONL 读取适配器
  - 文件:`cli/src/lib/context-readers/claude.ts`(新)、`cli/test/context-readers-claude.test.ts`
  - RED:用 fixture jsonl(`~/.claude/projects/<encoded>/<session>.jsonl`),测试读取最后一条含 usage 的 assistant 行,返回 `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`,cwd 编码后匹配项目目录,取最新修改 jsonl
  - GREEN:实现 `readClaudeUsage(cwd, sessionId?)`,反向流式读取 jsonl
  - REFACTOR:cwd-to-encoded-path 工具单独抽出
  - **Validates:** Requirements 10.3, 10.4

- [~] 14. 平台检测 + 终端复用器探测
  - 文件:`cli/src/lib/platform-detect.ts`(新)、`cli/test/platform-detect.test.ts`
  - RED:测试探测平台(OpenCode/Claude Code/Codex/unknown)和终端(tmux via $TMUX、wezterm via 命令存在、wt.exe via $WT_SESSION、bare)
  - GREEN:实现两个函数 `detectPlatform()` 和 `detectTerminalCapability()`,后者返回 `{kind: "tmux"|"wezterm"|"wt"|"bare", supports_in_place: boolean}`
  - REFACTOR:整理环境变量优先级
  - **Validates:** Requirements 5.7, 10.1

- [~] 15. forge context:usage 命令
  - 文件:`cli/src/commands/context.ts`(新)、`cli/test/context-usage.test.ts`
  - RED:测试 `forge context:usage --json` 在 OpenCode/Claude Code 各返回正确字段(`platform/session_id/total_context/window_size/usage_pct/source/last_forge_event/fresh_session_advised/method`);Codex 返回 `ok:false, reason:"unsupported_platform"`
  - GREEN:整合 Task 12-14,根据平台分派读取,根据终端能力决定 `fresh_session_advised` 与 `method`
  - REFACTOR:阈值判断从 config 读
  - **Validates:** Requirements 10.1, 10.5, 10.6, 10.7

- [~] 16. 配置段 context_management 加入 schema
  - 文件:`schemas/config.schema.json`、`cli/src/state/config.ts`
  - RED:测试 config.json 含 `context_management: {enabled, threshold_pct, strategy, fallback, min_tasks_between_handoff}` 时通过 schema 校验,缺失字段使用默认值
  - GREEN:更新 schema,扩展 ForgeConfig 类型,defaultConfig 提供合理默认
  - REFACTOR:文档化每个字段含义
  - **Validates:** Requirement 11.4

### Phase 3:种子注入(Layer 2)

- [~] 17. feature:start 注入 Compact Instructions 到 memory file
  - 文件:`cli/src/state/memory.ts`、`cli/src/commands/feature.ts`
  - RED:测试 `feature:start` 在 CLAUDE.md/AGENTS.md 注入 `## Compact Instructions` 块(三条:读 progress.json / 读 handoff.md / 压缩后 /resume)
  - GREEN:扩展 memory writer,在 WORKFLOW_RULES 旁加 Compact Instructions 段
  - REFACTOR:模板字符串集中
  - **Validates:** Requirement 6.4

- [~] 18. forge init 生成 Claude Code PreCompact/PostCompact hook
  - 文件:`cli/src/commands/init.ts`、`hooks/pre-compact.template`、`hooks/post-compact.template`
  - RED:测试 init 在 Claude Code 平台生成 `.claude/settings.json` 含 PreCompact + PostCompact hook,均调用 `forge handoff:get`
  - GREEN:在 init 流程检测平台,生成对应 hook 配置
  - REFACTOR:hook 模板抽到独立文件
  - **Validates:** Requirement 6.3

- [~] 19. 安装文档加 Claude Code 环境变量推荐
  - 文件:`docs/install-claude-code.md`(新或现有)
  - GREEN:文档化 `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=60` 与 `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`,解释为何推荐
  - REFACTOR:与 CLI 平台特定 README 链接
  - **Validates:** Requirement 6.5

### Phase 4:context-manager 插件(Layer 3)

- [~] 20. 插件骨架 + 配置加载
  - 文件:`cli/src/plugins/context-manager.ts`(新)
  - RED:测试 `enabled: false` 时,所有插件方法都是 noop;读 `.forge/config.json` 的 `context_management` 段
  - GREEN:实现插件加载、enabled 短路
  - REFACTOR:接口抽象
  - **Validates:** Requirements 11.1, 11.2, 11.6

- [~] 21. run-loop 暴露 task:done 后的 context 检查点
  - 文件:`cli/src/commands/run-loop.ts`、`cli/src/commands/next-action.ts`
  - RED:测试 `run-loop` 在 executing 阶段且上一个 task 刚完成时,调用 `context:usage`,根据返回决定:正常下一个 task / 返回 `action: "handoff-session"` 携带 method
  - GREEN:在 next-action 的 executing handler 加入检查点逻辑(计算 last_forge_event,调 context:usage,阈值判断 + 防循环判断)
  - REFACTOR:把 hook 点抽出来,让插件可注册
  - **Validates:** Requirements 5.1, 5.2, 5.3, 11.3

- [~] 22. 防 handoff 循环计数
  - 文件:`cli/src/commands/run-loop.ts`、`cli/src/lib/handoff.ts`
  - RED:测试连续两次 run-loop 调用之间未完成新 task 时,第二次不返回 `handoff-session`
  - GREEN:在 handoff 元数据(handoff.md frontmatter 或单独文件)记录上次 handoff 时的 completed_tasks,判断是否已 +1
  - REFACTOR:`min_tasks_between_handoff` 从 config 读
  - **Validates:** Requirement 5.9

- [~] 23. OpenCode 链路 A 实现(SDK 三步)
  - 文件:`.opencode/plugins/forge.js`、`cli/test/opencode-handoff.test.ts`
  - RED:在隔离的 OpenCode 测试 session 中,触发 `handoff-session` 动作,断言执行 `tui.executeCommand("session.new")` → `appendPrompt("/resume")` → `submitPrompt()`,清空后新 session 自动跑起 /resume
  - GREEN:在 forge.js 注册 `event` hook 监听 session.idle,收到 `handoff-session` 动作时执行 SDK 三步
  - REFACTOR:重试 + 失败降级到链路 B
  - **Validates:** Requirements 5.4, 5.6, 5.12, 11.7, 11.8

- [~] 24. Claude Code + tmux 链路 A 实现
  - 文件:`.forge/hooks/context-manager-tmux.sh`(模板)、`cli/src/commands/init.ts`
  - RED:在 tmux 测试 pane 中触发 Stop hook,后台脚本带延迟 send-keys `/clear` Enter,然后 send-keys 恢复命令 Enter,断言 `/clear` 真正执行(不是落进缓冲)
  - GREEN:实现 hook 脚本,延迟值默认 500ms,可配置
  - REFACTOR:与 WezTerm 共用恢复命令模板
  - **Validates:** Requirements 5.5, 5.6, 5.12

- [~] 25. Claude Code + WezTerm 链路 A 实现
  - 文件:`.forge/hooks/context-manager-wezterm.sh`(模板)
  - RED:同 tmux 但用 `wezterm cli send-text --pane-id $WEZTERM_PANE`
  - GREEN:实现 hook 脚本
  - REFACTOR:与 tmux 共用决策代码
  - **Validates:** Requirements 5.5, 5.6, 5.12

- [~] 26. Claude Code + wt.exe 兜底(开新窗口)
  - 文件:`.forge/hooks/context-manager-wt.cmd`(模板)
  - RED:在 Windows Terminal 中触发,后台调用 `wt new-tab -d <cwd> cmd /c "claude --append-system-prompt ..."`
  - GREEN:实现 cmd 脚本
  - REFACTOR:文档化"wt 不支持 send-input"的限制
  - **Validates:** Requirements 5.7, 5.12

- [~] 27. 链路 B 提示用户手动 compact
  - 文件:`skills/forge_executing/SKILL.md`、`cli/src/commands/run-loop.ts`
  - RED:测试 `compact_advised: true` 且无可用复用器时,skill 输出 SKILL-UX 格式提示("Context 占用 N% — 建议运行 /compact")
  - GREEN:扩展 forge_executing 在 D4 之前检查 context:usage,按需输出提示;run-loop 在 next-action 输出对应文本
  - REFACTOR:提示文本模板化
  - **Validates:** Requirements 6.1, 6.2

### Phase 5:验证与文档

- [~] 28. ut-5 风格端到端 token 验证
  - 文件:`docs/superpowers/specs/2026-06-04-context-management-validation.md`(新)
  - GREEN:在与 ut-5 同等复杂度的真实工程上重跑完整 forge feature(7 task,真实 implementer + 3 层 review + verify + done),从 OpenCode SQLite 读 token,对比目标:bash 测试 <3k、read <5k、最终 context <100k、可跑 task ≥20
  - REFACTOR:数据未达标时文档化偏离原因
  - **Validates:** Requirements 8.2, 9.1, 9.2, 9.3, 9.4

- [~] 29. 链路 A 真机时序验证(强制)
  - 文件:`docs/superpowers/specs/2026-06-04-context-management-validation.md`
  - GREEN:在 OpenCode、Claude Code+tmux、Claude Code+WezTerm、Claude Code+wt.exe 四种环境各跑一次,断言:① 清空/spawn 在 idle 时刻发起;② `/clear` 真正执行(不落缓冲);③ 恢复命令随后执行;④ 新上下文从正确 task 续上;⑤ 注入失败时静默降级到链路 B,progress.json 不变。记录每环境实测延迟值,写入插件默认配置
  - REFACTOR:任一环境跑不通则文档化并降级该环境到链路 B
  - **Validates:** Requirements 5.4, 5.5, 5.6, 5.7, 5.8, 5.12

- [~] 30. 安装/启用文档
  - 文件:`docs/context-manager-plugin.md`(新)
  - GREEN:文档化:① 插件如何启用/禁用(`enabled` 字段)、② 配置 strategy 选择、③ 各终端环境的预期行为、④ 故障排查(看 `forge context:usage` / 看 handoff.md / 看插件日志)
  - REFACTOR:与 README 链接
  - **Validates:** Requirement 11.4

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "name": "Phase 1 — 跨平台通用机制",
      "tasks": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      "depends_on": []
    },
    {
      "wave": 2,
      "name": "Phase 2 — context 占用读取基础",
      "tasks": [12, 13, 14, 15, 16],
      "depends_on": [1]
    },
    {
      "wave": 3,
      "name": "Phase 3 — 种子注入",
      "tasks": [17, 18, 19],
      "depends_on": [1]
    },
    {
      "wave": 4,
      "name": "Phase 4 — context-manager 插件 + 两条链路",
      "tasks": [20, 21, 22, 23, 24, 25, 26, 27],
      "depends_on": [2, 3]
    },
    {
      "wave": 5,
      "name": "Phase 5 — 验证与文档",
      "tasks": [28, 29, 30],
      "depends_on": [4]
    }
  ]
}
```

```
Layer 1(Task 1-11)— 跨平台通用,任意顺序内可并行
  Task 1 → Task 2 → Task 3
  Task 4 → Task 5 → Task 6
  Task 7 → Task 8 → Task 9 → Task 10 → Task 11

Layer 2 数据基础(Task 12-16)— 12-14 可并行,15-16 串行
  Task 12 ┐
  Task 13 ├→ Task 15 → Task 16
  Task 14 ┘

Layer 3 种子(Task 17-19)— 独立可并行
  Task 17, Task 18, Task 19

Layer 4 插件(Task 20-27)— 必须在 Layer 1+2 之后
  Task 20 → Task 21 → Task 22
                      ├→ Task 23(OpenCode)
                      ├→ Task 24(tmux)
                      ├→ Task 25(WezTerm)
                      ├→ Task 26(wt.exe)
                      └→ Task 27(链路 B)

Layer 5 验证(Task 28-30)— 最后,顺序执行
  Task 28 → Task 29 → Task 30
```

## Notes

- **30 个 task**,按 Phase 1-5 顺序推进
- **Phase 1(Task 1-11)即使不装插件也立即生效**——这是 Requirement 8.1 的核心保证
- **Phase 4(Task 20-27)是插件本体**,可独立开关,关闭时核心行为不变
- **Phase 5(Task 28-29)是强制验证**,坑 2 必须真机跑通,不接受纸上结案
- 每个 task 关联具体 Requirement,可追溯
- 实施时按依赖图并行化,预估总工期 1.5-2 周(单人,含验证)
