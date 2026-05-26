# Forge 设计文档 · Phase 1

> 相关文档：
> · [core.md](./core.md) — 核心哲学（WHY）
> · [forge-cli-design-v2.md](./forge-cli-design-v2.md) — CLI 技术设计（HOW）
> · [forge-design-spec-phase-2.md](./forge-design-spec-phase-2.md) — 二期设计

---

## 概述

Forge 是一个 AI 驱动的软件开发 orchestration 系统，输入需求（PRD / UI 设计稿 / 口述），产出正确、可信的软件。全程自动化，人只在两个节点介入：**需求确认** 和 **最终验收**。

Forge 是 Superpowers 的上层 orchestrator——它不重新实现 brainstorming、planning、TDD、code review，而是在 Superpowers 的执行纪律之上，增加 **需求场景化**、**执行状态管理**、**质量守卫（Guard）** 三层能力。

---

## 核心目标

**唯一目标**：保证 AI 产出的软件是正确、可信的。

"可信"的定义：
- 需求被准确理解（通过 scenarios 验证）
- 测试覆盖需求（TDD，测试来自需求场景）
- 测试全部通过（单元测试 + 集成测试 + 端到端测试）
- 代码质量合格（code review 通过）
- 变更影响可控（GitNexus blast radius 分析）

---

## 设计原则

1. **不猜测**：任何不确定的地方都问人，不做假设
2. **文件即状态**：所有状态存 `.forge/` 下，不依赖对话历史
3. **结果外化**：subagent 结果写文件，orchestrator 不持有详细内容
4. **测试驱动**：测试来自需求场景，不是 AI 自己编的
5. **复用而非重造**：文档产出完全用 Superpowers 格式和路径，Forge 只做 orchestration
6. **Runtime 下沉**：核心状态管理、验证逻辑、phase transition 通过 forge-cli 实现，skill 文件只负责调用 CLI 并解读输出。CLI 随插件一起分发，用户无需单独安装。
7. **Guard 机制**：可扩展的质量守卫，在关键节点拦截并检查

---

## 工具组合与职责边界

```
Superpowers   brainstorming / writing-plans / subagent-driven-development / TDD / code-review
              → 文档产出：docs/superpowers/specs/ 和 docs/superpowers/plans/
              → Forge 不干预这些产出位置

GitNexus      代码库理解（依赖图、变更影响分析）

gstack        增强测试（可选，浏览器测试、视觉 QA、性能测试）——Phase 2

forge         orchestration layer：
              → 需求场景化（scenarios）
              → 执行状态管理（progress.json）
              → 质量守卫（Guard）
              → 跨 session 记忆（动态 memory file）
              → 归档

              实现方式：
              · skill 文件（AI 指令层）→ 理解、决策、生成
              · forge-cli（Runtime 层）→ 状态读写、测试执行、
                                         phase transition 前置条件验证、
                                         schema 校验、audit trail
```

**Forge 不管理文档产出路径。** Superpowers 的 brainstorming 写到 `docs/superpowers/specs/`，writing-plans 写到 `docs/superpowers/plans/`——Forge 不搬运这些文件，不另建目录。

---

## Forge 管理的文件

```
.forge/
  config.json       # 项目配置（test mode, guard 设置, memory_file 等）
  progress.json     # 当前执行状态（task 进度、guard 历史）
  scenarios.json    # 当前 feature 的结构化场景
  specs/            # 归档的历史 scenarios
  bin/forge         # forge-cli 包装脚本（安装时生成）
  backups/          # forge reset 时的状态备份

<memory_file>       # 跨 session 记忆（CLAUDE.md / AGENTS.md / GEMINI.md，按平台）
```

**不再有 `docs/forge/` 目录。** 所有设计/规划文档由 Superpowers 管理。

---

## 跨平台记忆文件（Memory File）

不同 AI 平台使用不同的"项目记忆"文件：

| 平台 | 文件名 |
|------|--------|
| Claude Code | `CLAUDE.md` |
| OpenCode | `AGENTS.md` |
| Codex | `AGENTS.md` |
| Cursor | `CLAUDE.md` |
| Gemini CLI | `GEMINI.md` |

**Forge 不硬编码文件名。** 自动初始化时检测：

1. 已存在的文件优先（`CLAUDE.md` > `AGENTS.md` > `GEMINI.md`）
2. 都不存在 → 按平台环境变量决定：
   - `CLAUDE_PLUGIN_ROOT` 存在 → `CLAUDE.md`
   - OpenCode 环境 → `AGENTS.md`
   - Gemini CLI → `GEMINI.md`
   - 兜底 → `AGENTS.md`（最通用）
3. 结果记录到 `.forge/config.json` 的 `memory_file` 字段

Skill 中所有涉及"更新跨 session 记忆"的操作，通过
`forge memory:set-feature` / `forge memory:complete-feature` 执行，
CLI 内置写入后回读验证。

---

## Guard（质量守卫）

### 概念

Guard 是 Forge 在执行流程中插入的**质量检查点**。触发时暂停执行，运行检查逻辑，通过则继续，不通过则拦截并报告。

Guard 与 checkpoint（存档恢复点）不同——Guard 的目的是**质量拦截**，不是进度保存。

Guard 触发计算由 `forge task:done` 内部执行，AI 无需自行计数。
`task:done` 返回 `guard_triggered: true` 时，skill 文件进入 Guard 流程。

### 配置

```json
// .forge/config.json
{
  "guards": {
    "batch-review": {
      "enabled": true,
      "every_n_tasks": 6,
      "actions": ["spec-compliance-review", "session-handoff-suggestion"]
    }
  }
}
```

```json
// .forge/progress.json 中的 guard 历史
{
  "guard_history": [
    {
      "id": "guard-1",
      "type": "batch-review",
      "triggered_at": "2026-05-21T10:00:00Z",
      "task_range": [1, 6],
      "status": "passed",
      "notes": "No blocking issues"
    }
  ]
}
```

### Phase 1 实现的 Guard 类型

| Type | 触发条件 | 检查动作 | 失败行为 |
|------|---------|---------|---------|
| `batch-review` | 每完成 N 个 task（default: 6） | spec compliance review（场景是否被正确实现） | blocking issue → 暂停执行，等人修复 |

### Phase 2 可扩展的 Guard 类型

| Type | 触发条件 | 检查动作 |
|------|---------|---------|
| `coverage-gate` | 所有 task 完成后 | 测试覆盖率 ≥ 阈值 |
| `security-scan` | 涉及 auth/crypto 的 task 后 | 安全审计 |
| `performance-budget` | UI task 完成后 | bundle size / load time |
| `dependency-audit` | 新依赖引入后 | license + vulnerability |
| `human-review` | 用户自定义时机 | 暂停等人确认 |

### Guard 执行逻辑

```
forge task:done
  → CLI 内部检查 guard 触发条件（every_n_tasks 计数）
  → 返回 guard_triggered: true/false
  → true → skill 文件执行 guard actions（调用 Superpowers review）
          → forge guard:record --status passed|failed
          → passed → 继续下一个 task
          → failed → 暂停，报告，等待修复
```

---

## 用户命令

### `/start <需求>`

**用途**：开始一个全新的工作项

**行为**：
1. 自动初始化（如果 `.forge/config.json` 不存在）
   - `forge init --auto-detect` 完成所有探测与写入
   - Superpowers 可用性由 AI 感知后通过 `--superpowers-available` 传入
2. 调用 Superpowers brainstorming → 产出 `docs/superpowers/specs/` 下的设计文档
3. 调用 Forge scenarios skill → 生成 `.forge/scenarios.json`
4. 展示给用户确认
5. 等待 `/next`

### `/next`

**用途**：确认设计并执行，或继续执行

**行为**（按状态分）：
- `planning` → `forge phase:advance`（校验前置条件）→ 调 Superpowers writing-plans → 开始执行
- `executing` → 继续执行下一个 task
- 所有 task 完成 → `forge phase:complete` → `forge verify` → 全量验证

执行每个 task 的顺序：
```
forge task:start
→ Superpowers subagent-driven-development（AI 实现）
→ forge test（CLI 执行，AI 修复，最多 3 轮）
→ forge commit
→ forge task:done（CLI 内部触发 Guard 检查）
```

### `/resume`

**用途**：session 中断后恢复

**行为**：
- `forge status` 读取当前状态
- `forge audit` 重建完整时间线，校验一致性
- `forge commit:check` 验证 done 任务均有对应 commit
- 确认后继续

### `/done`

**用途**：完成归档

**行为**：
- `forge phase:complete`（校验所有 task 完成）
- `forge verify`（最终验收）
- `forge phase:finish`（校验 verification passed）
- 归档 scenarios.json → `.forge/specs/`
- `forge memory:complete-feature`（含回读验证）
- `forge reset` 到 idle（保留归档）

### `/bugfix <描述>`

**用途**：轻量 bug 修复（不走完整 planning）

**行为**：直接 TDD 修复，不调用 Superpowers brainstorming/writing-plans

---

## 完整工作流

```
/start <需求>
  │
  ├─ 自动初始化（首次）
  │    ├─ forge init --auto-detect
  │    │    ├─ 检测平台 → 确定 memory_file
  │    │    ├─ 检测依赖（GitNexus, gstack）
  │    │    ├─ 检测测试框架
  │    │    └─ 写 .forge/config.json + 初始化 memory file
  │    └─ AI 展示探测结果，用户确认
  │
  ├─ Superpowers brainstorming
  │    └─ 产出：docs/superpowers/specs/<feature>-design.md
  │
  ├─ Forge scenarios skill
  │    └─ 产出：.forge/scenarios.json
  │
  └─ 展示给用户确认，等待 /next

/next（确认后）
  │
  ├─ forge phase:advance
  │    └─ 校验：scenarios.json 存在 + P0 场景 + spec_path 已设置
  │
  ├─ Superpowers writing-plans
  │    └─ 产出：docs/superpowers/plans/<feature>.md
  │
  ├─ 提取 task 列表 → 初始化 progress.json
  │
  └─ 开始执行
       │
       ├─ For each task:
       │    ├─ forge task:start --id N
       │    ├─ Superpowers subagent-driven-development（AI 实现）
       │    ├─ forge test（失败 → AI 修复 → 重试，最多 3 轮）
       │    ├─ forge commit --tag "forge task-N"
       │    └─ forge task:done --id N
       │         ├─ guard_triggered: false → 继续
       │         └─ guard_triggered: true
       │              ├─ Superpowers requesting-code-review
       │              ├─ forge guard:record --status passed|failed
       │              ├─ passed → 继续
       │              └─ failed → 暂停，等人修复
       │
       └─ forge phase:complete → forge verify --coverage

/done
  │
  ├─ forge phase:finish（校验 verification passed）
  ├─ 归档 scenarios → .forge/specs/
  ├─ forge memory:complete-feature（含回读验证）
  └─ progress.json → idle
```

---

## .forge/config.json

```json
{
  "version": "1.0",
  "forge_cli_version": "0.2.0",
  "memory_file": "CLAUDE.md",
  "test_mode": "normal",
  "gstack_installed": false,
  "test_command": "go test ./...",
  "test_framework": "go",
  "test_coverage": { "unit": 80, "integration": 60, "e2e": "P0" },
  "project_type": "existing",
  "guards": {
    "batch-review": {
      "enabled": true,
      "every_n_tasks": 6,
      "actions": ["spec-compliance-review", "session-handoff-suggestion"]
    }
  }
}
```

---

## .forge/progress.json

```json
{
  "version": "1.0",
  "feature": "user-authentication",
  "status": "executing",
  "created_at": "2026-05-21T08:00:00Z",
  "updated_at": "2026-05-21T10:30:00Z",
  "plan_path": "docs/superpowers/plans/2026-05-21-user-authentication.md",
  "spec_path": "docs/superpowers/specs/2026-05-21-user-authentication-design.md",
  "total_tasks": 12,
  "completed_tasks": 8,
  "tasks": [
    { "id": 1, "title": "Create User model",    "status": "done",        "commit": "abc1234" },
    { "id": 2, "title": "Add login endpoint",   "status": "done",        "commit": "def5678" },
    { "id": 9, "title": "Rate limiting",         "status": "in_progress" },
    { "id": 10, "title": "Admin endpoint",       "status": "pending"     }
  ],
  "guard_history": [
    {
      "id": "guard-1",
      "type": "batch-review",
      "triggered_at": "2026-05-21T09:30:00Z",
      "task_range": [1, 6],
      "status": "passed"
    }
  ],
  "verification": {
    "status": "pending",
    "test_mode": "normal",
    "last_run": null
  }
}
```

**Status 枚举**（严格，CLI schema 校验强制，不允许其他值）：

| 字段 | 允许值 |
|------|--------|
| `status` | `idle` \| `planning` \| `executing` \| `verification_complete` \| `bugfix` |
| `task.status` | `pending` \| `in_progress` \| `done` \| `failed` \| `deferred` |
| `guard_history[].status` | `passed` \| `failed` \| `skipped` |
| `verification.status` | `pending` \| `in_progress` \| `passed` \| `failed` |

---

## .forge/scenarios.json

```json
{
  "version": "1.0",
  "feature": "user-authentication",
  "source": "docs/superpowers/specs/2026-05-21-user-authentication-design.md",
  "generated_at": "2026-05-21T08:15:00Z",
  "scenarios": [
    {
      "id": "S001",
      "title": "用户成功登录",
      "given": "用户在登录页",
      "when": "输入正确的用户名和密码",
      "then": [
        { "assertion": "返回 JWT access token", "type": "result" },
        { "assertion": "返回 refresh token",    "type": "result" }
      ],
      "testTypes": ["functional"],
      "priority": "P0"
    }
  ]
}
```

---

## 归档

`/done` 时的归档操作：

1. `forge phase:finish` 校验 verification.status = passed
2. 复制 `.forge/scenarios.json` → `.forge/specs/<feature>-scenarios.json`
3. `forge memory:complete-feature`（CLI 内置写入后回读验证）
4. 清理 progress.json → `{ "status": "idle" }`

不再移动 Superpowers 的文档（它们留在原位作为项目知识）。

---

## 与 Superpowers 的关系

**Forge 在 Superpowers 之上，不与之并列或冲突。**

```
用户
  ↓ /start, /next, /resume, /done, /bugfix
Forge skill 文件（AI 指令层）
  ↓ 调用
forge-cli（Runtime 层）         ← Phase 1 新增
  ↓ 执行状态管理、验证、phase transition
Superpowers（执行纪律层）
  ├─ brainstorming
  ├─ writing-plans
  ├─ subagent-driven-development
  ├─ test-driven-development
  └─ requesting-code-review
```

**关键规则：** 当 Forge 活跃时（`progress.json` 存在且 status ≠ idle），所有 feature 开发必须通过 Forge 命令触发 Superpowers，不允许直接调用 Superpowers 的 brainstorming/writing-plans 来绕过 Forge 的状态管理。

---

## 系统边界

**Forge 负责（独有能力）：**
```
├─ 需求场景化（scenarios.json，人类确认的测试来源）
├─ 执行状态管理（progress.json）
├─ Phase transition 前置条件验证（forge phase:*）
├─ 质量守卫（Guard 机制）
├─ 跨 session 记忆（动态 memory file + 回读验证）
├─ Audit trail（forge audit）
├─ 环境检测 + 安装引导（forge init --auto-detect）
├─ 归档
└─ 品牌化进度输出
```

**完全复用 Superpowers（不重新实现）：**
```
├─ brainstorming（需求澄清）→ 产出到 docs/superpowers/specs/
├─ writing-plans（任务规划）→ 产出到 docs/superpowers/plans/
├─ subagent-driven-development（任务执行）
├─ test-driven-development（TDD 纪律）
└─ requesting-code-review（代码 review）
```

**可选工具：**
```
├─ GitNexus（代码库分析、blast radius）— 现已集成
└─ gstack（增强测试）— Phase 2
```
