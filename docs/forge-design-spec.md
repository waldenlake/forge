# Forge 设计文档

## 概述

Forge 是一个 AI 驱动的软件开发 orchestration 系统，输入需求（PRD / UI 设计稿 / 口述），产出正确、可信的软件。全程自动化，人只在两个节点介入：**需求确认** 和 **最终验收**。

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
2. **文件即状态**：所有状态存文件，不依赖对话历史
3. **结果外化**：subagent 结果写文件，orchestrator 不持有详细内容
4. **批次隔离**：每批 ≤6 tasks，批次间开新 session，context 永不溢出
5. **测试驱动**：测试来自需求场景，不是 AI 自己编的
6. **复用而非重造**：核心能力复用现有工具，只做 orchestration
7. **纯 Plugin 模式**：Forge 作为各 AI 平台的原生 plugin 发布，不需要独立 CLI

---

## 工具组合

```
Superpowers   执行纪律（TDD、subagent-per-task、code review）
GitNexus      代码库理解（依赖图、变更影响分析）
gstack        增强测试（可选，浏览器测试、视觉 QA、性能测试）
forge         orchestration layer（串联以上工具 + 补足缺口）
```

**依赖关系：**
- Superpowers：必需，执行层核心
- GitNexus：必需（旧项目），可选（新项目）
- gstack：可选，决定测试模式（普通 vs 增强）

---

## 交付形式

**纯 Plugin（各平台原生安装）**

Forge 作为各 AI coding agent 平台的原生 plugin 发布，跟 Superpowers 一样。
不需要独立的 CLI 工具，不需要 `npx forge init`。

**安装方式：**

```bash
# Claude Code
/plugin install forge@claude-plugins-official

# OpenCode
# opencode.json 中添加：
# "plugin": ["forge@git+https://github.com/xxx/forge.git"]

# Codex
/plugins → search forge → Install

# Gemini CLI
gemini extensions install https://github.com/xxx/forge
```

**项目初始化：**
- 不需要单独的 init 命令
- `/start` 首次运行时自动检测项目未初始化，执行初始化
- 初始化内容：创建 `.forge/config.json`、目录结构、`CLAUDE.md`
- 检测 Superpowers、GitNexus 等依赖，缺失则提示安装

---

## 用户命令

### `/start <需求>`

**用途**：开始一个全新的工作项（新项目、新功能、重构）

**输入**：
- `<需求>`：文本描述、PRD 文档路径、UI 截图路径，或混合

**行为**：
1. 检测项目是否已初始化（`.forge/config.json` 是否存在）
   - 未初始化 → 自动执行初始化流程（见下方"自动初始化"）
2. 创建 `docs/forge/changes/<feature-slug>/`
3. 触发 Superpowers brainstorming
4. 生成 HTML mockup（如涉及 UI）
5. 触发 forge scenarios skill
6. 等待用户确认（`/next` 或修改后重新 `/start`）

**状态变化**：
```json
{
  "status": "planning",
  "feature": "<feature-slug>",
  "phase": "awaiting_confirmation"
}
```

---

### `/next`

**用途**：确认设计并执行，或批次完成后继续下一批

**前置条件**：
- `status: planning, phase: awaiting_confirmation` → 开始执行
- `status: batch_done` → 继续下一批

**行为**：

**场景 1：确认设计，开始执行**
1. 读取 `progress.json`，确认 `status: planning`
2. GitNexus analyze（旧项目）或跳过（新项目）
3. 触发 Superpowers writing-plans
4. 按批次切割（每批 ≤6 tasks）
5. GitNexus blast radius 分析每个 task
6. 生成 `docs/forge/changes/<feature>/plans/batch-1.md`
7. 开始执行 batch 1
8. 状态变为 `status: executing, batch: 1, task: 1`

**场景 2：批次完成，继续下一批**
1. 读取 `progress.json`，确认当前 batch 状态为 `done`
2. 检查是否还有剩余 batch
3. 有 → 开始下一批，状态变为 `batch: N+1, task: 1`
4. 无 → 触发全量验证（Phase 4）

**无歧义决策**：
- 根据 `progress.json` 的 `status` 和 `phase` 字段确定行为
- 不需要猜测用户意图

---

### `/resume`

**用途**：session 中断后恢复

**行为**：
1. 读取 `progress.json` 和 `CLAUDE.md`
2. 输出定位摘要：
   ```
   Feature: xxx
   已完成：batch 1-2（task 1-12）
   中断点：batch 3, task 3 执行中
   下一步：继续 task 3
   ```
3. 询问用户："是否从此处继续？（是/否/查看详情）"
4. 用户确认后，继续执行

**与 `/next` 的区别**：
- `/next`：主动推进，直接执行
- `/resume`：被动恢复，先定位再询问

---

### `/done`

**用途**：当前工作项完成，触发验收和归档

**前置条件**：
- 所有 batch 状态为 `done`
- 全量验证已通过

**行为**：
1. 验证 `progress.json`：所有 batch done
2. 未完成 → 报错："还有 N 个 task 未完成，请先完成或标记为延期"
3. 已完成 → 触发归档：
   - 合并 scenarios 到 `docs/forge/specs/`
   - 更新 CLAUDE.md（记录本次 feature 关键决策）
   - 清理 `progress.json`
   - 移动当前 change 到 archive
4. 输出完成摘要

---

### `/bugfix <描述>`

**用途**：专门的 bug 修复流程，跳过完整规划

**输入**：
- `<描述>`：bug 描述、复现步骤、或错误日志

**行为**：
1. 创建 `docs/forge/changes/bugfix-<id>/`
2. 追问复现步骤（如描述不清楚）
3. 确认复现后，GitNexus 分析影响范围
4. 生成轻量修复计划（1-3 个 task）
5. 执行修复（TDD，先写回归测试）
6. 验证修复（重跑测试 + 验证复现步骤不再触发）
7. 归档

**状态**：
```json
{
  "status": "bugfix",
  "feature": "bugfix-<id>",
  "tasks": ["task-1", "task-2"]
}
```

---

## 自动初始化流程

**触发**：`/start` 首次运行，检测到 `.forge/config.json` 不存在

```
1. 检测 .git 是否存在
   存在 → project_type = "existing"
   不存在 → project_type = "new"

2. 检测 Superpowers plugin 是否已安装
   未安装 → 报错，输出安装指令，中断

3. 检测 GitNexus（仅 existing 项目）
   未安装 → 警告，可继续（降级为无依赖分析）

4. 检测 gstack（可选）
   已安装 → 询问："检测到 gstack，是否启用增强测试模式？"
   未安装 → 询问："是否安装 gstack 开启增强测试？"
   用户选择否 → test_mode = "normal"

5. 检测测试框架
   自动探测（package.json / pytest.ini / go.mod / Cargo.toml）
   探测结果写入 config.json

6. 创建目录结构
   docs/forge/specs/
   docs/forge/changes/
   docs/forge/changes/archive/
   docs/forge/decisions/
   .forge/

7. 生成 .forge/config.json
   {
     "version": "1.0",
     "test_mode": "normal" | "enhanced",
     "gstack_installed": true | false,
     "batch_size": 6,
     "test_command": "<auto-detected>",
     "test_framework": "<auto-detected>",
     "test_coverage": { "unit": 80, "integration": 60, "e2e": "P0" },
     "project_type": "new" | "existing"
   }

8. 初始化 CLAUDE.md（追加 Forge section）

9. 输出初始化完成摘要，继续 /start 流程
```

---

## 完整工作流

### Phase 1：需求理解

**触发**：`/start <需求>`

```
1.1 接收输入
    支持格式：
      - 文本描述
      - PRD 文档路径（.md / .pdf / .docx）
      - UI 设计稿路径（.png / .jpg / .figma URL）
      - 混合（文本 + 截图）

1.2 自动初始化（如果项目未初始化）
    检测 .forge/config.json 不存在 → 执行自动初始化流程

1.3 创建 change 目录
    mkdir -p docs/forge/changes/<feature-slug>
    初始化 progress.json：
    {
      "feature": "<feature-slug>",
      "status": "planning",
      "phase": "brainstorming",
      "created_at": "ISO-8601"
    }

1.4 Superpowers brainstorming skill
    规则：
      - 有不清楚的地方全部问人，不做任何假设
      - 如果涉及 UI，生成 HTML mockup
      - 如果需求涉及多个独立子系统（判断标准：>3 个独立领域），
        拆分成多个独立 feature，分别 /start

    产出：
      docs/forge/changes/<feature>/proposal.md
      docs/forge/changes/<feature>/mockup.html（如有 UI）

1.5 forge scenarios skill
    读取 proposal.md，转成 Given/When/Then 场景

    产出：
      docs/forge/changes/<feature>/scenarios.json（机器可读）
      docs/forge/changes/<feature>/scenarios.md（人类可读）

1.6 展示给用户
    输出：
      - proposal.md 摘要
      - mockup.html（可交互）
      - scenarios.md
      - 询问："这些场景准确描述了你的需求吗？"

1.7 等待用户确认
    选项：
      A) 确认 → 用户执行 /next
      B) 修改 → 用户编辑文件，重新 /start（覆盖式更新）
      C) 取消 → 用户删除 change 目录

    phase 更新为 "awaiting_confirmation"
```

---

### Phase 2：任务规划

**触发**：`/next`（当 `status: planning, phase: awaiting_confirmation`）

```
2.1 代码库分析（旧项目）
    IF 项目已存在 .git：
      检测 GitNexus 是否已 analyze
      未 analyze → 运行 npx gitnexus analyze
      输出：代码库依赖图、社区结构
    ELSE（新项目）：
      跳过

2.2 Superpowers writing-plans skill
    输入：
      - proposal.md
      - scenarios.json
      - GitNexus 依赖图（如有）

    规则：
      - 每个 task 2-5 分钟工作量
      - 每个 task 包含：文件路径、完整代码、TDD 步骤、验证步骤
      - TDD 步骤来自 scenarios.json 对应场景
      - 假设实现者"零上下文、品味差、不懂测试"

    产出：
      docs/forge/changes/<feature>/plans/full-plan.md

2.3 GitNexus blast radius 分析
    对 full-plan.md 里的每个 task：
      查询影响范围：
        - 哪些文件会被修改
        - 哪些函数/类会受影响
        - 哪些调用链会改变
      写入 task 的 "Impact" section

2.4 批次切割
    规则：
      - 每批 ≤6 tasks
      - 按依赖关系分批（task A 依赖 task B，B 必须在前面的 batch）
      - 写入 docs/forge/changes/<feature>/plans/batch-N.md

2.5 更新 progress.json
    {
      "status": "executing",
      "phase": "batch_execution",
      "total_batches": N,
      "current_batch": 1,
      "batches": [...]
    }

2.6 开始执行 batch 1
    进入 Phase 3
```

---

### Phase 3：批次执行循环

**触发**：`/next`（自动从 Phase 2 进入），或 `/resume`

```
对当前 batch 的每个 task：

3.1 读取 task 定义
    从 batch-N.md 读取：
      - task title
      - files to modify
      - TDD steps（来自 scenarios）
      - verification steps
      - impact analysis（来自 GitNexus）

3.2 Superpowers subagent-driven-development
    派发 subagent，独立 context：
      - 传入：task 定义 + impact analysis + scenarios
      - subagent 执行 TDD：
          1. 写测试（来自 scenarios，先红）
          2. 写实现（变绿）
          3. 重构
          4. 验证步骤
      - 结果写入文件，不回传 orchestrator

3.3 progress-tracking skill（forge）
    subagent 完成后：
      写入 .forge/progress.json：
      {
        "batches": [{
          "batch": N,
          "tasks": [{
            "id": N,
            "status": "done",
            "commit": "abc123",
            "completed_at": "ISO-8601"
          }]
        }]
      }
      orchestrator 只记录："task N: done"（4 个字）

3.4 单元测试验证
    运行测试命令（从 config.json 读取，fallback 自动探测）
    不通过 → 自动修复（最多 3 轮）
    3 轮后仍不通过 → 标记 task 为 "failed"，提示人工介入

3.5 所有 task 完成后
    当前 batch 状态变为 "done"

3.6 Superpowers requesting-code-review
    两阶段 review：
      1. Spec compliance（是否符合 scenarios）
      2. Code quality（DRY、YAGNI、命名、结构）
    产出：docs/forge/changes/<feature>/review-batch-N.md
    有 blocking issue → 标记 batch 为 "blocked"，停止

3.7 session-handoff skill（forge）
    更新 CLAUDE.md + 生成恢复指令
    提示用户开新 session

3.8 循环
    用户执行 /next（或 /resume）→ 回到 3.1，执行下一 batch
```

---

### Phase 4：全量验证

**触发**：所有 batch 完成后自动触发

```
4.1 运行完整测试套件
    单元测试 + 集成测试
    覆盖率要求：≥80%（可配置）

4.2 构建验证
    npm run build / cargo build / go build
    确保能成功构建

4.3 测试模式分支

    **普通测试模式（无 gstack）：**
      到此结束，生成测试报告：
      docs/forge/changes/<feature>/test-report.html

    **增强测试模式（有 gstack）：**
      4.3.1 /qa（浏览器测试 + 自动修复）
      4.3.2 /design-review（视觉 QA，如有 mockup）
      4.3.3 /benchmark（性能测试，如有性能场景）
      4.3.4 /qa-only（生成完整验收报告）

4.4 状态更新
    progress.json:
    {
      "status": "verification_complete",
      "test_mode": "enhanced" | "normal",
      "all_tests_passed": true | false,
      "report": "docs/forge/.../acceptance-report.html"
    }
```

---

### Phase 5：人工验收

```
5.1 输出验收报告
5.2 等待人工判断
    A) 通过 → 用户执行 /done
    B) 不通过 → 指出问题 → 回到 Phase 3 修复
    C) 部分通过 → 标记延期 → 执行 /done
```

---

### Phase 6：归档

**触发**：`/done`

```
6.1 验证前置条件（所有 batch done 或 deferred）
6.2 合并 scenarios 到 docs/forge/specs/
6.3 更新 CLAUDE.md（记录关键决策）
6.4 归档 change 目录到 archive/
6.5 清理 progress.json → status: "idle"
6.6 输出完成摘要
```

---

## Plugin 架构

### 仓库结构（Forge Plugin 源码）

```
forge/                              ← Git 仓库，作为 plugin 发布
  .claude-plugin/
    plugin.json                     ← Claude Code plugin 元信息
    marketplace.json                ← marketplace 注册（可选）
  .cursor-plugin/
    plugin.json                     ← Cursor plugin 元信息
  .opencode/
    INSTALL.md                      ← OpenCode 安装指导
  hooks/
    hooks.json                      ← Claude Code SessionStart hook 配置
    hooks-cursor.json               ← Cursor hook 配置
    run-hook.cmd                    ← 跨平台 polyglot wrapper
    session-start                   ← bash 脚本，注入 forge meta-skill
  skills/
    start/SKILL.md                  ← /start 命令
    next/SKILL.md                   ← /next 命令
    resume/SKILL.md                 ← /resume 命令
    done/SKILL.md                   ← /done 命令
    bugfix/SKILL.md                 ← /bugfix 命令
    scenarios/SKILL.md              ← 内部：场景生成
    progress-tracking/SKILL.md      ← 内部：进度跟踪
    session-handoff/SKILL.md        ← 内部：跨 session 恢复
    using-forge/SKILL.md            ← meta-skill：介绍 forge 能力
  commands/                         ← slash commands（如平台支持）
    start.md
    next.md
    resume.md
    done.md
    bugfix.md
```

### 跨平台机制

**环境变量（由平台自动设置）：**
- `CLAUDE_PLUGIN_ROOT`：Claude Code / Copilot CLI
- `CURSOR_PLUGIN_ROOT`：Cursor
- plugin 内部脚本通过这些变量定位自身位置

**hooks.json：**
```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|clear|compact",
      "hooks": [{
        "type": "command",
        "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start",
        "async": false
      }]
    }]
  }
}
```

**run-hook.cmd（polyglot，同时是 batch 和 bash）：**
- Windows：batch 部分执行，找 Git Bash 运行实际脚本
- Unix：直接作为 bash 脚本执行
- 学习 Superpowers 的跨平台方案

**session-start 脚本：**
- 读取 `using-forge/SKILL.md` 内容
- 检测当前平台（Claude Code / Cursor / Copilot CLI）
- 输出对应格式的 JSON context injection
- AI 启动后立即知道 forge 能力和可用 skill

### Skill 发现机制

**不在 manifest 里列举 skills。** 跟 Superpowers 一样：
1. SessionStart hook 注入 `using-forge` meta-skill 内容
2. meta-skill 告诉 AI："你有 forge，以下是可用命令..."
3. AI 通过平台原生 `Skill` tool 按名称加载具体 skill
4. 平台自动在 plugin 目录的 `skills/` 下查找

### Tool Mapping（多平台适配）

Skills 内部使用 Claude Code 的 tool 名称，其他平台通过 reference 文件映射：

```
skills/using-forge/references/
  codex-tools.md       ← Codex tool 映射
  opencode-tools.md    ← OpenCode tool 映射
  gemini-tools.md      ← Gemini CLI tool 映射
```

---

## Context 管理策略

### 主防线：结果外化 + 批次切割

**结果外化：**
```
subagent 执行 task：
  ↓
结果写入 .forge/progress.json + git commit
  ↓
orchestrator 只记录："task N: done"（4 个字）
  ↓
需要回顾时从文件读，不从对话历史读
```

**批次切割：**
```
16 个 task 分 3 批：
  batch 1: task 1-6   → session 1
  batch 2: task 7-12  → session 2（新）
  batch 3: task 13-16 → session 3（新）
```

每批完成后自动提示开新 session，context 永远不会积累到满。

### 跨 session 记忆：CLAUDE.md

每个 session 启动时 AI 平台自动读取，forge 自动维护：

```markdown
## Forge

**项目信息**
- 名称：xxx
- 架构：xxx
- 技术栈：xxx
- 测试模式：normal

**当前 Feature**
- Feature：<feature-slug>
- 已完成：batch 1-2（task 1-12）
- 当前：batch 3，从 task 13 开始
- Review 状态：batch 1-2 通过，无 blocking issue

**关键决策**
- 2026-05-20：使用 JWT 而不是 session，原因：xxx

**已完成 Features**
- feature-login (2026-05-15)
  - 架构：JWT + Redis
  - 测试覆盖：95%
```

### 机器可读进度：.forge/progress.json

任何命令读取这个文件就知道精确状态，不需要从对话历史推断。

---

## 项目目录结构（用户项目内）

```
project-root/
  CLAUDE.md                           # 跨 session 记忆（forge 自动维护）

  docs/forge/
    specs/                            # 项目级 spec（归档后积累）
      user-authentication-scenarios.json

    changes/                          # 当前进行中的 feature
      user-authentication/
        proposal.md
        scenarios.json
        scenarios.md
        mockup.html（如有 UI）
        plans/
          full-plan.md
          batch-1.md
          batch-2.md
          batch-3.md
        review-batch-1.md
        test-report.html

      archive/                        # 已完成的 feature
        2026-05-15-user-login/

    decisions/                        # 架构决策记录（ADR）
      001-use-jwt-instead-of-session.md

  .forge/
    config.json                       # 项目配置
    progress.json                     # 当前任务进度（机器可读）
    test-baseline/                    # 视觉测试基准截图（Phase 2）

  src/                                # 实际代码
  tests/                              # 测试代码
```

---

## forge 的 8 个 skill

### `using-forge` meta-skill

**触发时机**：每个 session 启动时通过 SessionStart hook 自动注入

**职责**：告诉 AI forge 存在哪些能力和命令

**内容要点**：
- forge 是什么
- 可用命令列表（/start、/next、/resume、/done、/bugfix）
- 何时应该检查 forge skill（"如果用户说要做一个新功能..."）
- 状态文件位置（.forge/progress.json）

---

### `scenarios` skill

**触发时机**：brainstorming 完成后，writing-plans 之前

**输入**：proposal.md + mockup.html（如有）

**行为**：
1. 读取 proposal，识别所有功能点
2. 对每个功能点生成 Given/When/Then 场景
3. 标明测试类型（功能/UI/性能/安全）和优先级（P0/P1/P2）
4. 生成 scenarios.json（机器可读）+ scenarios.md（人类可读）
5. 展示给用户确认

---

### `progress-tracking` skill

**触发时机**：每个 task 完成后

**职责**：规定 subagent 完成 task 后的标准操作

**行为**：
1. 运行单元测试，确认通过
2. git commit（格式：`feat: <task-title> [forge task-N]`）
3. 写入 .forge/progress.json
4. orchestrator 只记录 "task N: done"

**禁止行为**：
- 禁止 subagent 将详细结果回传给 orchestrator
- 唯一的状态来源是 .forge/progress.json 文件

**错误处理**：
- 测试不通过 → 自动修复（最多 3 轮）
- 3 轮后仍不通过 → 标记 status: "failed"，中断 batch

---

### `session-handoff` skill

**触发时机**：每个 batch 完成后

**职责**：准备跨 session 恢复所需的所有信息

**行为**：
1. 更新 CLAUDE.md
2. 生成标准化恢复指令（供用户粘贴到新 session）
3. 提示用户开新 session

---

## 测试策略

### 测试来源（TDD 的核心）

```
scenarios.json（人确认过的需求场景）
  ↓
writing-plans skill 为每个 task 分配对应的 scenario
  ↓
subagent 执行 task 时，先把 scenario 转成测试代码（红）
  ↓
写实现让测试通过（绿）
  ↓
重构
```

### 测试层次

1. **单元测试（TDD）**：每个 task 完成后运行
2. **集成测试（TDD）**：每个 batch 完成后运行
3. **端到端测试（增强模式，Phase 2）**：gstack `/qa`
4. **视觉测试（增强模式，Phase 2）**：gstack `/design-review`
5. **性能测试（增强模式，Phase 2）**：gstack `/benchmark`

### 测试覆盖率目标

- 单元测试覆盖率：≥80%（可配置）
- 集成测试覆盖率：≥60%（可配置）
- 端到端测试：所有 P0 scenario

### 测试命令探测

混合策略：
1. 读取 .forge/config.json 的 test_command
2. 如果不存在，自动探测（package.json / pytest.ini / go.mod / Cargo.toml）
3. 写入 config.json 供后续使用

---

## 错误处理

### 命令级错误

- `/start`：需求为空 → 报错；已有进行中的 feature → 报错
- `/next`：无当前 feature → 报错；状态不匹配 → 报错
- `/resume`：无当前 feature → 报错；progress.json 损坏 → 尝试从 git log + CLAUDE.md 重建
- `/done`：未完成 task → 报错；验证未通过 → 报错
- `/bugfix`：描述为空 → 报错；复现步骤不清楚 → 追问

### 执行级错误

- subagent task 失败（3 轮修复后）→ 标记 "failed"，中断 batch，提示人工介入
- GitNexus 查询失败 → 警告，继续（降级为无依赖分析）
- Code review blocking issue → 中断 batch，等待人工修复

### 恢复策略

- progress.json 损坏 → 从 git log 的 `[forge task-N]` commit 重建
- 状态不一致 → 输出警告，询问用户

---

## gstack 集成策略（第二期）

### 安装检测

自动初始化时检测 gstack 是否已安装（作为 plugin），
询问用户是否启用增强测试模式。

### 测试模式差异

- **普通模式**：单元测试 + 集成测试 + 构建验证 + 测试报告
- **增强模式**：+ 浏览器测试 + 视觉 QA + 性能测试 + 完整验收报告

### 使用的 gstack skill（仅 6 个）

- `/qa`：浏览器测试 + 自动修复
- `/qa-only`：纯报告模式
- `/browse`：浏览器导航、交互、截图
- `/design-review`：视觉 QA
- `/benchmark`：性能测试
- `/setup-browser-cookies`：导入 Cookie

---

## 第一期 / 第二期

### 第一期（MVP）

**目标**：核心流程可用，普通测试模式，纯 plugin 架构

**交付内容：**

**Plugin 结构：**
- `.claude-plugin/plugin.json`：元信息
- `hooks/`：SessionStart hook + polyglot wrapper
- `skills/`：8 个 skill（5 用户级 + 3 内部级）+ 1 meta-skill

**用户命令 Skill：**
- `/start`：brainstorming → scenarios → 人确认
- `/next`：planning → 批次执行
- `/resume`：恢复定位 → 继续执行
- `/done`：归档
- `/bugfix`：轻量 bug 修复流程

**内部 Skill：**
- `scenarios`：生成 Given/When/Then 场景
- `progress-tracking`：状态外化规则
- `session-handoff`：跨 session 恢复

**Meta-Skill：**
- `using-forge`：SessionStart 注入，介绍 forge 能力

**测试：**
- 单元测试（TDD）
- 集成测试
- 构建验证
- 测试报告

**跨平台支持：**
- Claude Code（hooks.json + plugin.json）
- OpenCode（INSTALL.md + opencode.json 配置）

**不包含：**
- gstack 集成（第二期）
- 视觉测试（第二期）
- 性能测试（第二期）
- Codex / Gemini CLI / Cursor 支持（第二期）

---

### 第二期

**目标**：增强测试模式，更多平台支持

**新增内容：**
- gstack 集成（6 个测试 skill）
- 增强测试模式
- 完整验收报告
- Codex / Cursor / Gemini CLI 平台适配
- Tool mapping reference 文件

---

## 系统边界总结

**forge 负责（作为 plugin 交付）：**
```
├── SessionStart hook（注入 meta-skill）
├── 5 个用户命令 skill（/start、/next、/resume、/done、/bugfix）
├── 3 个内部 skill（scenarios、progress-tracking、session-handoff）
├── 1 个 meta-skill（using-forge）
├── 工作流编排（Phase 1-6）
├── 状态管理（progress.json、CLAUDE.md）
├── 自动初始化（首次 /start 时）
├── 跨平台 hook + tool mapping
└── 目录结构约定
```

**复用工具（不重新实现）：**
```
├── Superpowers
│   ├── brainstorming（需求澄清）
│   ├── writing-plans（任务规划）
│   ├── subagent-driven-development（任务执行）
│   ├── test-driven-development（TDD 纪律）
│   └── requesting-code-review（代码 review）
│
├── GitNexus
│   ├── analyze（代码库索引）
│   ├── blast radius（变更影响分析）
│   └── dependency graph（依赖查询）
│
└── gstack（可选，第二期）
    ├── /qa（浏览器测试 + 自动修复）
    ├── /qa-only（验收报告）
    ├── /browse（浏览器导航）
    ├── /design-review（视觉 QA）
    ├── /benchmark（性能测试）
    └── /setup-browser-cookies（认证测试）
```

---

## 总结

forge 是一个纯 plugin 形态的 orchestration 系统，通过各 AI 平台的原生 plugin 机制安装和使用。它串联 Superpowers、GitNexus、gstack 三个工具，加上 scenarios、progress-tracking、session-handoff 三个补足 skill，实现从需求到可信产出的完整自动化流程。

**核心价值：**
- 测试来自需求场景（人确认过），不是 AI 编的
- 状态存文件，context 永不溢出
- 批次隔离，任意中断可恢复
- 不猜测，不假设，所有不确定的地方问人
- 复用成熟工具，只做 orchestration
- 纯 plugin 模式，无独立 CLI，各平台原生安装

**第一期交付 Claude Code + OpenCode 的 plugin，第二期加入更多平台和 gstack 增强测试。**
