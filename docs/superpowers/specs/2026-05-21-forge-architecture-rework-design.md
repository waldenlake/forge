# Forge Architecture Rework Design

## Background

Forge-test 项目（用 Forge 工作流构建的 JWT 认证系统）暴露了 Forge 当前架构的根本问题：AI 实际执行时绕过了 Forge 的状态管理层，文档产出物落到了 Superpowers 的位置（`docs/superpowers/`）而不是 Forge 规定的位置（`docs/forge/changes/`），progress.json 格式被随意改动，session-handoff 和 batch 切割从未触发。

根因不是"AI 不遵守约束"，而是 Forge 试图与 Superpowers 并列竞争文档产出位置，AI 自然选择了更熟悉、更成熟的 Superpowers 路径。

## Decision

**Forge 不再管理文档产出位置。** Superpowers 负责 spec/plan 的格式和位置，Forge 只做真正的 orchestration——状态管理、场景化、质量守卫、跨 session 记忆。

## Architectural Changes

### 1. 文档产出完全归 Superpowers

- `docs/superpowers/specs/` — brainstorming 产出（设计文档）
- `docs/superpowers/plans/` — writing-plans 产出（实现计划）

**移除：** `docs/forge/changes/<feature>/` 整套目录结构。Forge 不再生成 proposal.md、不再搬运 plan 文件、不再创建 batch-N.md。

### 2. Forge 管理的文件极简化

```
.forge/
  config.json       # 项目配置
  progress.json     # 执行状态
  scenarios.json    # 当前 feature 的结构化场景
  specs/            # 归档的 scenarios（feature 完成后保留）
    <feature>-scenarios.json

<memory_file>       # CLAUDE.md / AGENTS.md / GEMINI.md（按平台）
```

### 3. 跨平台 Memory File

不再硬编码 `CLAUDE.md`。检测顺序：
1. 已存在文件优先（CLAUDE.md > AGENTS.md > GEMINI.md）
2. 平台环境变量决定（Claude Code → CLAUDE.md，OpenCode/Codex → AGENTS.md，Gemini → GEMINI.md）
3. 兜底 → AGENTS.md

文件名记录到 `.forge/config.json` 的 `memory_file` 字段。所有 skill 通过这个字段读取/写入。

### 4. Batch 升华为 Guard（质量守卫）

**问题：** 原 batch 切割概念混淆了两件事——context 管理 + 质量检查。

**新设计：** Guard 是可扩展的质量守卫机制。在执行流程中插入**质量检查点**。

```json
// .forge/config.json
{
  "guards": {
    "batch-review": {
      "enabled": true,
      "every_n_tasks": 6,
      "actions": ["spec-compliance-review"]
    }
  }
}
```

```json
// .forge/progress.json
{
  "guard_history": [
    { "id": "guard-1", "type": "batch-review", "task_range": [1, 6], "status": "passed" }
  ]
}
```

**Guard 不是 checkpoint。** Checkpoint 是存档恢复点，Guard 是质量拦截点。

未来可扩展类型：
- `coverage-gate`（测试覆盖率）
- `security-scan`（安全审计）
- `performance-budget`（性能预算）
- `dependency-audit`（依赖审计）
- `human-review`（人工审核暂停）

### 5. Forge 在 Superpowers 之上，不并列

```
用户
  ↓ /start, /next, /resume, /done, /bugfix
Forge（orchestration 层）
  ↓ 调用
Superpowers（执行纪律层）
```

**关键约束：** 当 Forge 活跃时（progress.json 存在且 status ≠ idle），所有 feature 开发必须通过 Forge 命令触发 Superpowers。AI 不允许直接调用 brainstorming/writing-plans 来绕过 Forge 的状态管理。

## Components Affected

| Skill | 改动 |
|-------|------|
| `using-forge/SKILL.md` | 加入"Forge 优先于 Superpowers"的拦截规则 |
| `start/SKILL.md` | 检测 memory file，调 Superpowers brainstorming（保留其产出位置），调 scenarios |
| `scenarios/SKILL.md` | 输入改为 `docs/superpowers/specs/<feature>-design.md`，输出仍为 `.forge/scenarios.json` |
| `next/SKILL.md` | 调 Superpowers writing-plans（保留其产出位置），从 plan 提取 task 列表到 progress.json，触发 Guard |
| `progress-tracking/SKILL.md` | 加入 Guard 触发逻辑 |
| `session-handoff/SKILL.md` | 写入 memory_file（不硬编码 CLAUDE.md） |
| `done/SKILL.md` | 简化归档：scenarios → `.forge/specs/`，不移动 Superpowers 文档 |
| `resume/SKILL.md` | 读取 memory_file（不硬编码 CLAUDE.md） |
| `bugfix/SKILL.md` | 同样不硬编码 memory file |

## Data Schema

### config.json

```json
{
  "version": "1.0",
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
      "actions": ["spec-compliance-review"]
    }
  }
}
```

### progress.json

```json
{
  "version": "1.0",
  "feature": "user-authentication",
  "status": "executing",
  "created_at": "2026-05-21T08:00:00Z",
  "updated_at": "2026-05-21T10:30:00Z",
  "spec_path": "docs/superpowers/specs/2026-05-21-user-authentication-design.md",
  "plan_path": "docs/superpowers/plans/2026-05-21-user-authentication.md",
  "total_tasks": 12,
  "completed_tasks": 8,
  "tasks": [
    { "id": 1, "title": "...", "status": "done", "commit": "abc1234" }
  ],
  "guard_history": [
    { "id": "guard-1", "type": "batch-review", "task_range": [1, 6], "status": "passed" }
  ],
  "verification": {
    "status": "pending",
    "test_mode": "normal",
    "last_run": null
  }
}
```

**Status 枚举（严格）：**
- `status`: `idle` | `planning` | `executing` | `verification_complete` | `bugfix`
- `task.status`: `pending` | `in_progress` | `done` | `failed` | `deferred`
- `guard_history[].status`: `passed` | `failed` | `skipped`

## Migration

旧的 progress.json 格式（带 batches 数组）需要被新格式（扁平 tasks 数组 + guard_history）替代。由于 forge-test 是测试项目，不需要数据迁移。

旧的 `docs/forge/changes/` 目录可以安全删除（用户项目里如有遗留可在 /start 自动初始化时清理）。

## Out of Scope

- 不实现新的 Guard 类型（只保留 batch-review）
- 不修改 Superpowers 的任何 skill
- 不改变 plugin 安装机制（Claude Code/OpenCode 配置不变）
