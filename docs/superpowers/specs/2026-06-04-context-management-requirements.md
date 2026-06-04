# Requirements Document

> Forge Context 管理

> Requirements · 2026-06-04
>
> 本 requirements 基于在 OpenCode 上对 ut-5 项目跑完一个完整 forge feature 的实测结果(7 task,171 消息,28 subagent,最终 context 162,688 tokens)。配套设计文档:`2026-06-04-context-management-design.md`。

---

## Introduction

forge 当前在严格遵守自身设计的前提下,跑完一个**理想 feature** 后主线程 context 已达 81% 上限,使大 feature 无法跑完。本规格定义了让 forge 在固定 context 窗口下跑完任意大小 feature 所需的能力。

设计的根本方向是贯彻 forge 已有的 **State as Contract** 信条:工作流关键状态写入文件,任何压缩或 session 切换都不能丢失。具体落地为三层结构:跨平台通用机制(主线程瘦身)→ 压缩种子注入(状态恢复)→ 平台触发适配(主动/被动压缩)。

---

## Glossary

| 术语 | 含义 |
|---|---|
| **主线程 / 主 session** | forge 流程中负责协调的顶层 agent session,与 subagent session 相对 |
| **subagent** | 由主线程派发的独立 agent,有自己的 context window;forge 的 implementer / spec-reviewer / quality-reviewer 都是 subagent |
| **handoff.md** | `.forge/handoff.md`,记录"当前 feature 状态 + next task"的最小恢复文档,本 spec 引入 |
| **压缩种子** | 压缩发生前注入的内容,确保压缩后 agent 能从中重建必要状态 |
| **第 1/2/3 层** | 设计文档的三层结构:跨平台通用 / 压缩种子注入 / 平台触发适配 |
| **ut-5 实测** | 在 ut-5 项目上跑完一个完整 forge feature 的真实数据来源(7 task,163k 最终 context) |
| **Auto-resume** | forge 现有能力:`using-forge` skill 在 session 启动时检测 `status != idle` 自动调用 `/resume` |
| **PreCompact / PostCompact** | Claude Code 提供的 hook 事件 |
| **session.compacting** | OpenCode 提供的等价 hook 事件 |

---

## Requirements

### Requirement 1: 大输出落盘 + 摘要回传

**User Story:** 作为运行 forge feature 的 agent,我希望 `forge test` / `forge verify` 跑测试时不要把完整测试输出注入主线程 context,这样我才能避免每次测试都吃掉数千 token。

#### Acceptance Criteria

1. WHEN agent 运行 `forge test --summarize` 命令 THE 系统 SHALL 把完整 stdout/stderr 写入 `.forge/reports/test-<ISO timestamp>.log` 并返回 JSON 包含 `passed`、`failed`、`skipped`、`duration_ms`、`failures[]`、`report_path`。
2. WHERE `failures[]` 数组返回 THE 系统 SHALL 最多保留 5 个 failure,且每个 failure 的 `error` 字段截断到 200 字符。
3. WHEN agent 运行 `forge verify --summarize` 命令 THE 系统 SHALL 把完整 verification report 写入 `.forge/reports/verify-<timestamp>.json` 并返回结构化摘要。
4. WHILE forge feature 运行期间 THE 系统 SHALL 维护 `.forge/reports/` 目录,在 `/done` 阶段的 `reset --backup` 中处理。
5. WHERE `forge_executing/SKILL.md` 文档明确规定 THE 主线程 SHALL NOT 直接 `bash python -m pytest` / `bash cargo test`,必须走 `forge test --summarize`。

---

### Requirement 2: 主线程 read/edit/write 硬约束

**User Story:** 作为 forge 设计的维护者,我希望主线程被强制限制为"状态机"角色,不让它读取大文件、修改代码、跑测试,这样累积 context 就不会失控。

#### Acceptance Criteria

1. THE `forge_executing/SKILL.md` SHALL 包含 ⛔ 规则块,明确列出主线程在 task 期间的禁令:禁止 edit / write / patch、禁止 read 源代码与测试与 spec/plan 全文、禁止 bash 跑测试或构建。
2. THE `forge_executing/SKILL.md` SHALL 包含主线程允许的工具白名单:status 查看、forge_cli 命令、subagent 派发、摘要展示。
3. WHEN(第二阶段)agent 运行 `forge task:done --id <N>` THE 系统 SHALL 调用平台 SDK 反查本 task 期间主 session 的 part 列表。
4. IF 检测到 edit/write/patch 工具调用且不在已知 subagent session 列表里 THEN THE 系统 SHALL 拒绝完成 task 并返回 `violations[]` + `recovery: "implementer subagent must own all implementation work"`。

---

### Requirement 3: Subagent 返回契约

**User Story:** 作为主线程协调者,我希望 subagent 的返回是结构化、定长的,这样我才能保证一次 subagent 派发的 context 残留是可预期的。

#### Acceptance Criteria

1. THE `subagent-driven-development` 派发 prompt 模板末尾 SHALL 包含强制返回格式块,要求 subagent 回复以 `STATUS: [DONE|BLOCKED|FAILED]` / `COMMIT: <git sha or "none">` / `REPORT: <path or "none">` / `SUMMARY: <one line, max 200 chars>` 四行结尾。
2. THE prompt SHALL 明确指示 subagent 把详细工作记录写到 `REPORT` 指向的文件,不放进回复正文。
3. WHEN 主线程收到 subagent 返回 THE 主线程 SHALL 只解析这 4 个字段,其它内容忽略。
4. THE 主线程 SHALL NOT 主动读 `REPORT` 路径的文件,除非用户明确要求或决策路由必需。

---

### Requirement 4: handoff.md 自动维护

**User Story:** 作为压缩或 session 切换后恢复工作流的 agent,我希望从一份固定路径的最小恢复文档就能知道"在哪、下一步是什么",这样不需要任何对话历史就能精确续上。

#### Acceptance Criteria

1. WHEN agent 运行 `forge task:done` 完成 task THE 系统 SHALL 自动完整重写(不是追加)`.forge/handoff.md`。
2. THE handoff.md SHALL 包含字段:`feature`、`status`、`tasks` (<done>/<total>)、`deferred_tasks`、`last_task` (id/title/commit)、`next_task` (id/title/scenarios)、`spec_path`、`plan_path`、`generated_at`、`Resume command: /resume`。
3. THE 系统 SHALL 提供 `forge handoff:get` 命令,输出 handoff.md 内容供 hook/skill 读取。
4. IF handoff.md 不存在 WHEN `forge handoff:get` 被调用 THEN THE 系统 SHALL 实时从 progress.json 重建后输出。
5. WHILE forge feature 处于活动状态 THE handoff.md 字段值与 progress.json SHALL 在任意时刻保持一致;`forge audit` SHALL 检查这一点,不一致时报告 drift。
6. WHEN feature 完成(`/done` 的 `phase:finish` 触发) THE 系统 SHALL 清空或归档 handoff.md,与 `scenarios.json` 归档处理一致。

---

### Requirement 5: 链路 A — 原地清空重启(in-place restart)

**User Story:** 作为在支持 send-input/SDK 的环境(OpenCode / tmux / WezTerm)里跑 forge 的用户,我希望在 task 边界**原地清空当前 session 上下文并自动恢复工作流**,这样既得到真正干净的上下文,又不用切换窗口。

#### Acceptance Criteria

1. WHEN `task:done` 完成 AND `forge context:usage` 的 `usage_pct` 越过阈值 AND 检测到支持原地清空的环境 THE 系统 SHALL 在 `context:usage` 输出中置 `fresh_session_advised: true` 且 `method: "in-place"`。
2. THE context 阈值评估 SHALL 只发生在 `task:done` 之后、领取下一个 task 之前;WHILE task 在执行中 THE 系统 SHALL NOT 评估或触发切换。
3. WHEN `run-loop` 检测到上一个 task 刚完成 AND `usage_pct` 越阈值 AND `fresh_session_advised` AND 距上次 handoff 已完成 ≥1 个 task THE `run-loop` SHALL 返回 `action: "handoff-session"` 携带 `method`(in-place | new-window)。
4. WHEN method 为 in-place AND 平台是 OpenCode THE 系统 SHALL 用 SDK `tui.executeCommand("session.new")` → `appendPrompt("/resume")` → `submitPrompt()` 原地清空并恢复。
5. WHEN method 为 in-place AND 平台是 Claude Code + tmux/WezTerm THE 系统 SHALL 用 `send-keys`/`send-text` 向当前 pane 发 `/clear`,再补发恢复命令(解决坑 1:清空后是空会话)。
6. WHEN 清空/注入动作发起 THE 系统 SHALL 在 agent **完全 idle** 时刻(Claude Code `Stop` hook / OpenCode `session.idle`)由脱离的后台进程执行,带可配置延迟(解决坑 2:时序)。
7. IF 环境是 Claude Code + wt.exe(不支持 send-input,microsoft/terminal#9368 仍 open) THEN THE 系统 SHALL 退化为开新窗口(`wt new-tab` + `--append-system-prompt`)。
8. WHEN 清空或新窗口后 THE SessionStart auto-resume(Requirement 7)SHALL 自动从 handoff + progress.json 锚定并继续工作流。
9. WHILE 距上次 handoff 尚未完成任何新 task THE 系统 SHALL NOT 再次触发 handoff(防循环)。
10. THE forge 核心 SHALL NOT 自行执行清空/spawn;只输出 `handoff-session` 动作,由 context-manager 插件(Requirement 11)执行。
11. IF 当前不在任何支持的终端环境里 THEN THE 系统 SHALL 不置 `fresh_session_advised`,降级到 Requirement 6(链路 B)。
12. IF 原地清空或新窗口执行失败(spawn 失败 / send-keys 超时) THEN THE 系统 SHALL 静默降级到链路 B,不阻断核心工作流。

---

### Requirement 6: 链路 B — 手动 compact 提示 + 种子注入

**User Story:** 作为在裸终端(无复用器)跑 forge 的用户,我希望 forge 在合适时机提示我手动压缩,并保证压缩后能精准恢复,这样即使不能开新 session 也不会丢失工作流状态。

#### Acceptance Criteria

1. WHEN `task:done` 完成 AND `usage_pct` 越过阈值 AND 无可用终端复用器 THE 系统 SHALL 在 `context:usage` 输出中置 `compact_advised: true`。
2. WHEN `compact_advised: true` THE 阶段 skill SHALL 向用户输出 SKILL-UX 格式的提示,建议运行 `/compact` 然后 `/resume`。
3. WHEN `forge init` 在 Claude Code 平台运行 THE 系统 SHALL 在 `.claude/settings.json` 中生成 `PreCompact` 和 `PostCompact` hook,均调用 `forge handoff:get`。
4. WHEN `forge feature:start` 运行 THE 系统 SHALL 在项目根 CLAUDE.md / AGENTS.md 中注入 `## Compact Instructions` 块,内容包含:读 progress.json 拿状态、读 handoff.md 拿 next task、压缩后自动 `/resume`。
5. THE forge 安装文档 SHALL 推荐 Claude Code 用户设 `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=60` 与 `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`。
6. THE forge SHALL NOT 尝试程序化触发 `/compact`(Anthropic 不支持);仅通过提示 + hook 种子 + 环境变量在用户触发或系统触发的压缩中保住状态。
7. IF 系统在 task 中途强制 auto-compact(用户错过提示) THEN PreCompact 种子 + SessionStart auto-resume SHALL 仍能恢复工作流。

---

### Requirement 7: SessionStart auto-resume(沿用现有)

**User Story:** 作为压缩后或新会话的 agent,我希望自动从 progress.json + handoff.md 恢复工作流,不需要用户手动调用 /resume。

#### Acceptance Criteria

1. THE forge 现有的 `using-forge` skill 中"Auto-Resume on Session Start"逻辑 SHALL 保留并继续工作:`status != idle` 时自动 invoke `/resume`。
2. WHEN `/resume` skill 恢复 THE skill SHALL 优先读 `forge handoff:get`。
3. IF handoff.md 缺失 THEN `/resume` SHALL fallback 到 `forge status` 计算 next task。
4. WHEN 压缩或 session 切换发生 THE `/resume` 恢复能力 SHALL NOT 受影响——progress.json 是真相源,handoff.md 是性能优化的种子。

---

### Requirement 8: 第 1 层收益独立性

**User Story:** 作为不在 OpenCode/Claude Code 上跑 forge 的用户(例如 Codex CLI),我希望即使没有压缩 hook,主线程瘦身改动也能带来 context 占用降低。

#### Acceptance Criteria

1. THE Requirement 1-4 的全部能力 SHALL NOT 依赖任何压缩/hook 机制,纯靠 forge CLI + skill 文档落地。
2. WHEN 在不启用主动压缩 hook 的情况下跑 ut-5 风格测试(7 task + 真实 implementer + 3 层 review + verify + done) THE 主线程最终 context SHALL 低于 100k tokens(对照实测的 163k)。
3. WHERE 平台没有 hook 支持(如 Codex CLI) THE forge SHALL 仍能完整使用 Requirement 1-4 的能力,只是失去 Requirement 5-7 的额外收益。

---

### Requirement 9: 端到端可验证

**User Story:** 作为本 spec 的实施者,我希望有清晰的、基于真实数据的验证标准,确认改动确实达到了预期效果。

#### Acceptance Criteria

1. WHEN 阶段 1 完成 THE 实施者 SHALL 在与 ut-5 同等复杂度的真实工程上重跑一次完整 forge feature。
2. THE 验证 SHALL 通过 OpenCode SQLite 数据库的 `message`/`part` 表读取真实 token 数据。
3. THE 改后目标 SHALL 满足:bash 测试输出 < 3k tokens、read 文件 < 5k tokens、最终 context < 100k tokens、可跑 task 数 ≥ 20。
4. IF 任一指标未达标 THEN 实施者 SHALL 文档化偏离原因,而不是凭推算结案。

---

### Requirement 10: 跨平台 context 占用读取

**User Story:** 作为 forge Runtime,我希望能作为外部进程读取当前平台落盘的 session 文件,确定性地算出 context 占用率,这样压缩决策和用户提示就有了不依赖 AI 自我感知的真相源。

#### Acceptance Criteria

1. THE 系统 SHALL 提供 `forge context:usage [--json] [--session <id>]` 命令,返回 `platform`、`session_id`、`total_context`、`window_size`、`usage_pct`、`source`、`last_forge_event` 字段。
2. WHEN 运行平台是 OpenCode THE 系统 SHALL 读取 `~/.local/share/opencode/opencode.db` 的 `message` 表,取当前 session 最新 assistant 消息,占用 = `tokens.input + tokens.cache.read`。
3. WHEN 运行平台是 Claude Code THE 系统 SHALL 读取 `~/.claude/projects/<encoded-cwd>/<session>.jsonl`,取最后一条含 `usage` 的 assistant 行,占用 = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`。
4. WHEN 当前会话 session id 未显式提供 THE 系统 SHALL 通过 cwd 匹配定位当前活动 session(OpenCode 按 `directory` 列;Claude Code 按 cwd 编码的项目目录名取最新 jsonl)。
5. IF 运行平台不支持(如 Codex CLI 无本地 transcript) THEN THE 系统 SHALL 返回 `ok:false` + `reason:"unsupported_platform"`,调用方据此降级。
6. THE `forge context:usage` SHALL 是确定性的、纯读取的操作,不依赖 agent 自我报告 token 占用。
7. THE Requirement 5(链路 A 清空重启)与 Requirement 6(链路 B 提示 compact)SHALL 复用本命令作为占用率与终端能力的数据源,不各自实现读取逻辑。

---

### Requirement 11: context 管理作为可插拔插件

**User Story:** 作为 forge 用户,我希望 context 管理是一个可以一键开关、可配置策略的独立插件,这样核心工作流不被绑定,我能按自己的终端环境和偏好灵活选择行为。

#### Acceptance Criteria

1. THE context 管理能力(占用感知 + 两条链路执行)SHALL 封装为独立插件 `context-manager`,与 forge 核心 5-phase 解耦。
2. WHILE 插件 `enabled: false` THE forge 核心 SHALL 完全按今天的行为运行,不做任何 context 介入。
3. THE forge 核心 SHALL 只在 `task:done` 后暴露一个 context 检查点(hook 点),不在核心里内置清空/压缩逻辑。
4. THE 插件配置 SHALL 位于 `.forge/config.json` 的 `context_management` 段,包含 `enabled`、`threshold_pct`、`strategy`(in-place-restart | new-window | prompt-compact | off)、`fallback`、`min_tasks_between_handoff`。
5. WHEN 首选 `strategy` 在当前终端不可用 THE 插件 SHALL 自动校验并退到 `fallback` 策略。
6. THE 插件 SHALL NOT 持有任何状态;所有状态读自 progress.json / handoff.md / context:usage(符合 State as Contract)。
7. IF 插件执行动作失败 THEN THE 插件 SHALL 静默降级,绝不阻断核心工作流。
8. THE 插件实现 SHALL 按平台分派:OpenCode 作为 `.opencode/plugins/forge.js` 的 hook;Claude Code 作为 `.claude/settings.json` 的 `Stop` hook + 脱离后台脚本;两者共用 `forge context:usage` 决策核心。
9. THE 第 1 层能力(Requirement 1-4)SHALL 不依赖本插件,插件关闭时第 1 层仍生效。

---

## Out of Scope(明确不做)

- **Codex CLI 的压缩种子注入**:Codex 没有 hook 系统,无法支持;只享受 Requirement 1-4 的收益。
- **细粒度的 context 计费/可视化**:不在本 spec 范围,可后续单独立项。
- **跨 session 任务并行**:本 spec 假定单 session 串行执行 forge feature。
- **Subagent 内部 context 管理**:本 spec 关注主线程;subagent 自身的 context 增长(实测中 swift-otter 撑到 138k)是另一个相关但独立的问题。
- **现有 5-phase 工作流的修改**:本 spec 不改 `/start /planning /executing /verify /done` 的状态机,只在执行边界注入 context 管理能力。

---

## 相关参考

- 实测数据来源:`ses_16f56a834ffeOuYBvRhQS7S3nu`(cosmic-canyon, ut-5 项目)
- Claude Code 调研:`docs/claude-code-context-management.md`
- 设计文档:`2026-06-04-context-management-design.md`
- forge 真相源:`docs/forge-current-state.md`
