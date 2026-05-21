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

**极轻量 CLI + 纯 skill（markdown）**

```bash
npx forge init        # 唯一需要的 CLI 操作
```

init 做的事：
1. 检测 Superpowers，未安装则引导安装
2. 检测 GitNexus，未安装则引导安装（旧项目）
3. 询问是否安装 gstack（决定测试模式）
4. 生成 forge skill 文件
5. 生成项目目录结构
6. 初始化 CLAUDE.md
7. 初始化 .forge/config.json

**多平台支持（skill 一份，manifest 各一份）：**

```
.claude-plugin/plugin.json     Claude Code
.codex-plugin/plugin.json      Codex
.opencode/plugin.json          OpenCode
```

---

## 用户命令

### `/start <需求>`

**用途**：开始一个全新的工作项（新项目、新功能、重构）

**输入**：
- `<需求>`：文本描述、PRD 文档路径、UI 截图路径，或混合

**行为**：
1. 创建 `docs/forge/changes/<feature-slug>/`
2. 触发 Superpowers brainstorming
3. 生成 HTML mockup（如涉及 UI）
4. 触发 forge scenarios skill
5. 等待用户确认（`/next` 或修改后重新 `/start`）

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

1.2 创建 change 目录
    mkdir -p docs/forge/changes/<feature-slug>
    初始化 progress.json：
    {
      "feature": "<feature-slug>",
      "status": "planning",
      "phase": "brainstorming",
      "created_at": "ISO-8601"
    }

1.3 Superpowers brainstorming skill
    规则：
      - 有不清楚的地方全部问人，不做任何假设
      - 如果涉及 UI，生成 HTML mockup
      - 如果需求涉及多个独立子系统（判断标准：>3 个独立领域），
        拆分成多个独立 feature，分别 /start

    产出：
      docs/forge/changes/<feature>/proposal.md
      docs/forge/changes/<feature>/mockup.html（如有 UI）

1.4 forge scenarios skill
    读取 proposal.md，转成 Given/When/Then 场景

    格式：
    ## Scenario 1: 用户登录
    **Given**: 用户在登录页
    **When**: 输入正确的用户名和密码
    **Then**: 跳转到首页，显示用户名

    每个场景包含：
      - 功能场景（对应后端/逻辑测试）
      - UI 场景（对应视觉测试，如有 mockup）
      - 性能场景（对应性能测试，如有要求）

    产出：
      docs/forge/changes/<feature>/scenarios.md

1.5 展示给用户
    输出：
      - proposal.md 摘要
      - mockup.html（可交互）
      - scenarios.md
      - 询问："这些场景准确描述了你的需求吗？"

1.6 等待用户确认
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
      - scenarios.md
      - GitNexus 依赖图（如有）

    规则：
      - 每个 task 2-5 分钟工作量
      - 每个 task 包含：文件路径、完整代码、TDD 步骤、验证步骤
      - TDD 步骤来自 scenarios.md 对应场景
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

    例如 16 个 task：
      batch-1.md: task 1-6
      batch-2.md: task 7-12
      batch-3.md: task 13-16

2.5 更新 progress.json
    {
      "status": "executing",
      "phase": "batch_execution",
      "total_batches": 3,
      "current_batch": 1,
      "batches": [
        {
          "batch": 1,
          "status": "pending",
          "tasks": [
            {"id": 1, "title": "...", "status": "pending"},
            {"id": 2, "title": "...", "status": "pending"},
            ...
          ]
        },
        ...
      ]
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
        "batches": [
          {
            "batch": 1,
            "tasks": [
              {
                "id": 1,
                "status": "done",
                "commit": "abc123",
                "completed_at": "ISO-8601"
              }
            ]
          }
        ]
      }

      orchestrator 只记录："task 1: done"（4 个字）

3.4 单元测试验证
    运行测试命令（自动探测）：
      - npm test（如有 package.json）
      - pytest（如有 pytest.ini）
      - go test（如有 go.mod）
      - cargo test（如有 Cargo.toml）

    不通过 → 自动修复（最多 3 轮）：
      1. 读取测试错误
      2. subagent 修复
      3. 重跑测试
      4. 3 轮后仍不通过 → 标记 task 为 "failed"，提示人工介入

3.5 所有 task 完成后
    当前 batch 状态变为 "done"

3.6 Superpowers requesting-code-review
    两阶段 review：
      1. Spec compliance（是否符合 scenarios）
      2. Code quality（DRY、YAGNI、命名、结构）

    产出：
      docs/forge/changes/<feature>/review-batch-N.md

    有 blocking issue → 标记 batch 为 "blocked"，停止

3.7 session-handoff skill（forge）
    更新 CLAUDE.md：
    ## Forge
    - Feature: <feature-slug>
    - 已完成：batch 1（task 1-6）
    - Review：通过，无 blocking issue
    - 下一步：batch 2，从 task 7 开始

    输出恢复指令（用户粘贴到新 session）：
    继续 feature：<feature-slug>
    已完成：batch 1
    下一批：batch 2
    执行：/next

3.8 提示用户
    "Batch 1 完成（6/16 tasks done）。
     建议开新 session 继续，避免 context 溢出。
     执行 /next 继续 batch 2。"

3.9 循环
    用户执行 /next（或 /resume）→ 回到 3.1，执行下一 batch
```

---

### Phase 4：全量验证

**触发**：所有 batch 完成后自动触发

```
4.1 运行完整测试套件
    单元测试 + 集成测试
    命令：npm test / pytest / go test / cargo test
    覆盖率要求：≥80%（可配置）

4.2 构建验证
    npm run build / cargo build / go build
    确保能成功构建

4.3 测试模式分支

    **普通测试模式（无 gstack）：**
      到此结束，生成测试报告：
      docs/forge/changes/<feature>/test-report.html
      包含：
        - 测试覆盖率
        - 失败的测试（如有）
        - 构建日志

    **增强测试模式（有 gstack）：**

      4.3.1 /setup-browser-cookies（如需要认证）
            从真实浏览器导入 Cookie

      4.3.2 /qa（gstack）
            层级：Standard（默认）或 Exhaustive（可配置）
            行为：
              - 浏览器测试每个 scenario
              - 发现 bug → 自动修复（最多 3 轮）
              - 每个修复原子 commit
              - 重新验证

            产出：
              - Before/after 健康评分
              - Bug 修复列表 + 截图证据
              - Ship-readiness 摘要

      4.3.3 /design-review（gstack）
            如果有 UI mockup：
              - 80 项视觉审计
              - 截图 vs mockup 对比
              - 发现问题 → 自动修复
              - Before/after 截图

            产出：
              - 视觉问题列表
              - 修复截图
              - 设计一致性评分

      4.3.4 /benchmark（gstack）
            如果有性能要求（scenarios 里定义）：
              - Core Web Vitals
              - 页面加载时间
              - 交互响应时间

            阈值来自 scenarios 或默认：
              - LCP < 2.5s
              - FID < 100ms
              - CLS < 0.1

      4.3.5 /qa-only（gstack）
            纯报告模式，不修改代码
            生成完整验收报告：
            docs/forge/changes/<feature>/acceptance-report.html

            包含：
              - 所有 scenarios 的测试结果
              - 截图（每个 scenario）
              - 性能指标
              - 视觉对比
              - 测试覆盖率

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
    增强模式：打开 acceptance-report.html（浏览器）
    普通模式：打开 test-report.html

    报告包含：
      - 功能测试结果（绿色/红色）
      - 截图（每个 UI scenario）
      - 性能指标（如有）
      - 代码覆盖率
      - 已知问题列表（如有）

5.2 等待人工判断
    选项：
      A) 通过 → 用户执行 /done
      B) 不通过 → 指出问题 → 系统记录问题 → 回到 Phase 3 修复
      C) 部分通过 → 标记某些 task 延期 → 执行 /done（延期 task 记录在 progress.json）
```

---

### Phase 6：归档

**触发**：`/done`

```
6.1 验证前置条件
    检查 progress.json：
      - 所有 batch 状态为 "done"（或部分 task 标记为 "deferred"）
      - verification_complete: true

    不满足 → 报错，列出未完成的 task

6.2 合并 scenarios 到项目 spec
    cp docs/forge/changes/<feature>/scenarios.md \
       docs/forge/specs/<feature>-scenarios.md

    这些 scenarios 成为项目知识的一部分，后续开发可参考

6.3 更新 CLAUDE.md
    追加本次 feature 的关键信息：
    ## Completed Features
    - <feature-slug> (2026-05-21)
      - 架构决策：xxx
      - 关键 trade-off：xxx
      - 测试覆盖：xx%
      - 延期 task：xxx（如有）

6.4 归档 change 目录
    mkdir -p docs/forge/changes/archive/
    mv docs/forge/changes/<feature> \
       docs/forge/changes/archive/2026-05-21-<feature>/

6.5 清理 progress.json
    保留项目级配置，清除当前 feature 状态：
    {
      "current_feature": null,
      "status": "idle"
    }

6.6 输出完成摘要
    Feature: <feature-slug>
    状态：已完成
    总 task：16
    完成：15
    延期：1（task-12，原因：xxx）
    测试覆盖率：92%
    归档位置：docs/forge/changes/archive/2026-05-21-<feature>/
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

orchestrator 的 context 增长从"每个 task 的完整结果"（几百个 token）变成"每个 task 一行状态"（4 个 token），16 个 task 也只增加 64 token。

**批次切割：**
```
16 个 task 分 3 批：
  batch 1: task 1-6   → session 1
  batch 2: task 7-12  → session 2（新）
  batch 3: task 13-16 → session 3（新）
```

每批完成后自动提示开新 session，context 永远不会积累到满。

单批上限：6 tasks
- 6 tasks × (read task + execute + write result) ≈ 每批 20-30k tokens
- 远低于 context 窗口（Claude Code 约 200k tokens）
- 留足空间给 brainstorming、planning、review

### 跨 session 记忆：CLAUDE.md

每个 session 启动时 Claude Code 自动读取，forge 自动维护：

```markdown
## Forge

**项目信息**
- 名称：xxx
- 架构：xxx
- 技术栈：xxx
- 测试模式：enhanced（gstack installed）

**当前 Feature**
- Feature：<feature-slug>
- 已完成：batch 1-2（task 1-12）
- 当前：batch 3，从 task 13 开始
- Review 状态：batch 1-2 通过，无 blocking issue

**关键决策**
- 2026-05-20：使用 JWT 而不是 session，原因：xxx
- 2026-05-19：选择 PostgreSQL 而不是 MongoDB，原因：xxx

**已完成 Features**
- feature-login (2026-05-15)
  - 架构：JWT + Redis
  - 测试覆盖：95%
- feature-dashboard (2026-05-10)
  - 架构：React + TanStack Query
  - 测试覆盖：88%
```

新 session 读取后立刻知道：项目是什么、在做什么、做到哪里、关键决策是什么。

### 机器可读进度：.forge/progress.json

```json
{
  "version": "1.0",
  "feature": "user-authentication",
  "status": "executing",
  "phase": "batch_execution",
  "created_at": "2026-05-20T08:00:00Z",
  "updated_at": "2026-05-21T10:30:00Z",

  "total_batches": 3,
  "current_batch": 2,

  "batches": [
    {
      "batch": 1,
      "status": "done",
      "started_at": "2026-05-20T08:30:00Z",
      "completed_at": "2026-05-20T10:15:00Z",
      "tasks": [
        {
          "id": 1,
          "title": "Create User model",
          "status": "done",
          "commit": "abc1234",
          "completed_at": "2026-05-20T09:00:00Z"
        },
        {
          "id": 2,
          "title": "Add login endpoint",
          "status": "done",
          "commit": "def5678",
          "completed_at": "2026-05-20T09:30:00Z"
        },
        ...
      ]
    },
    {
      "batch": 2,
      "status": "in_progress",
      "started_at": "2026-05-21T09:00:00Z",
      "tasks": [
        {
          "id": 7,
          "title": "Implement JWT generation",
          "status": "done",
          "commit": "ghi9012",
          "completed_at": "2026-05-21T09:45:00Z"
        },
        {
          "id": 8,
          "title": "Add token validation middleware",
          "status": "in_progress",
          "started_at": "2026-05-21T10:00:00Z"
        },
        ...
      ]
    },
    {
      "batch": 3,
      "status": "pending",
      "tasks": [...]
    }
  ],

  "verification": {
    "status": "pending",
    "test_mode": "enhanced",
    "last_run": null
  }
}
```

任何命令读取这个文件就知道精确状态，不需要从对话历史推断。

---

## 目录结构

```
project-root/
  CLAUDE.md                           # 跨 session 记忆（forge 自动维护）

  docs/forge/
    specs/                            # 项目级 spec（归档后积累）
      user-authentication-scenarios.md
      dashboard-scenarios.md

    changes/                          # 当前进行中的 feature
      user-authentication/
        proposal.md                   # brainstorming 产出
        scenarios.md                  # Given/When/Then 场景
        mockup.html                   # UI mockup（如有）
        plans/
          batch-1.md
          batch-2.md
          batch-3.md
        review-batch-1.md             # code review 结果
        review-batch-2.md
        test-report.html              # 测试报告（普通模式）
        acceptance-report.html        # 验收报告（增强模式）

      archive/                        # 已完成的 feature
        2026-05-15-user-login/
        2026-05-10-dashboard/

    decisions/                        # 架构决策记录（ADR）
      001-use-jwt-instead-of-session.md
      002-choose-postgresql.md

  .forge/
    config.json                       # 项目配置
    progress.json                     # 当前任务进度（机器可读）
    test-baseline/                    # 视觉测试基准截图
      scenario-1-login-page.png
      scenario-2-dashboard.png

  .claude/                            # Claude Code 相关
    skills/
      forge/
        start.md
        next.md
        resume.md
        done.md
        bugfix.md
        scenarios.md
        progress-tracking.md
        session-handoff.md

  .gitnexus/                          # GitNexus 索引（旧项目）
    repos/
      <repo-name>/
        graph.db

  src/                                # 实际代码
  tests/                              # 测试代码
```

---

## forge 新增的 skill

### `scenarios` skill

**触发时机**：brainstorming 完成后，writing-plans 之前

**输入**：
- `docs/forge/changes/<feature>/proposal.md`
- `docs/forge/changes/<feature>/mockup.html`（如有）

**行为**：
1. 读取 proposal，识别所有功能点
2. 对每个功能点生成 Given/When/Then 场景
3. 如果有 mockup，生成 UI 场景（"Given 在 XX 页面，When 点击 XX 按钮，Then 显示 XX"）
4. 如果 proposal 提到性能要求，生成性能场景（"Given 100 并发用户，When 同时登录，Then 响应时间 <2s"）
5. 展示给用户确认

**产出**：
```markdown
# Scenarios: User Authentication

## Scenario 1: 用户成功登录
**Given**: 用户在登录页
**When**: 输入正确的用户名和密码，点击"登录"
**Then**: 
  - 跳转到首页
  - 显示用户名
  - localStorage 存储 JWT token

**Test Type**: 功能测试 + UI 测试
**Priority**: P0

## Scenario 2: 用户登录失败（密码错误）
**Given**: 用户在登录页
**When**: 输入正确的用户名，错误的密码，点击"登录"
**Then**:
  - 停留在登录页
  - 显示错误提示："密码错误"
  - 不存储 token

**Test Type**: 功能测试 + UI 测试
**Priority**: P0

## Scenario 3: Token 自动刷新
**Given**: 用户已登录，token 即将过期（剩余 5 分钟）
**When**: 用户发起任意 API 请求
**Then**:
  - API 请求成功
  - 返回新的 token
  - localStorage 更新 token

**Test Type**: 集成测试
**Priority**: P1

## Scenario 4: 登录页响应时间
**Given**: 100 并发用户
**When**: 同时访问登录页
**Then**:
  - 95th percentile 响应时间 <500ms
  - 无错误

**Test Type**: 性能测试
**Priority**: P2
```

**注意事项**：
- 场景必须是可测试的，不能模糊（"系统运行良好"不行，"响应时间 <2s"可以）
- 每个场景标明测试类型（功能/UI/性能/安全）
- 优先级（P0 必须、P1 应该、P2 可选）
- 这些场景直接对应后续的 TDD 测试用例

---

### `progress-tracking` skill

**触发时机**：每个 task 完成后

**职责**：规定 subagent 完成 task 后的标准操作

**行为**：
1. subagent 完成 task
2. 运行单元测试，确认通过
3. git commit（commit message 格式：`feat: <task-title> [forge task-N]`）
4. 写入 `.forge/progress.json`：
   ```json
   {
     "batches": [
       {
         "batch": 1,
         "tasks": [
           {
             "id": N,
             "status": "done",
             "commit": "<commit-sha>",
             "completed_at": "ISO-8601"
           }
         ]
       }
     ]
   }
   ```
5. orchestrator 只记录："task N: done"

**禁止行为**：
- 禁止 subagent 将详细结果回传给 orchestrator
- 禁止 orchestrator 在对话历史里持有任何 task 的实现细节
- 唯一的状态来源是 `.forge/progress.json` 文件

**错误处理**：
- 测试不通过 → 自动修复（最多 3 轮）
- 3 轮后仍不通过 → 标记 `status: "failed"`，中断当前 batch，提示人工介入

---

### `session-handoff` skill

**触发时机**：每个 batch 完成后

**职责**：准备跨 session 恢复所需的所有信息

**行为**：
1. 读取当前 batch 的执行结果
2. 更新 CLAUDE.md：
   ```markdown
   **当前 Feature**
   - Feature：user-authentication
   - 已完成：batch 1-2（task 1-12）
   - Review 状态：通过
   - 下一步：batch 3，从 task 13 开始
   ```
3. 生成标准化恢复指令（供用户粘贴）：
   ```
   继续 feature：user-authentication
   已完成：batch 1-2
   下一批：batch 3
   执行：/next
   ```
4. 输出给用户：
   ```
   Batch 2 完成（12/16 tasks done）。

   建议开新 session 继续，避免 context 溢出。
   复制下面的指令到新 session：

   继续 feature：user-authentication
   已完成：batch 1-2
   下一批：batch 3
   执行：/next
   ```

**恢复保证**：
- 新 session 启动时，Claude Code 自动读取 CLAUDE.md
- 用户粘贴恢复指令，forge 读取 `.forge/progress.json`
- 两者结合，新 session 精确知道在哪里，无需任何猜测

---

## gstack 集成策略

### 安装检测

```
forge init 时：
  检测 ~/.claude/skills/gstack 是否存在
  
  存在 → 询问："检测到 gstack，是否启用增强测试模式？"
  不存在 → 询问："是否安装 gstack 开启增强测试？
              （需要 Bun + ~200MB 磁盘空间，
               安装后可进行浏览器测试、视觉 QA、性能测试）"

  用户选择"是" → 引导安装：
    git clone https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
    cd ~/.claude/skills/gstack && ./setup

  用户选择"否" → 普通测试模式

写入 .forge/config.json：
{
  "test_mode": "enhanced" | "normal",
  "gstack_installed": true | false
}
```

### 测试模式差异

**普通测试模式（无 gstack）：**
- 单元测试（npm test / pytest / etc）
- 集成测试
- 构建验证
- 测试报告（HTML）

**增强测试模式（有 gstack）：**
- 所有普通测试
- **浏览器测试**（`/qa`）：真实浏览器，截图证据，自动 bug 修复
- **视觉 QA**（`/design-review`）：截图 vs mockup 对比，80 项审计
- **性能测试**（`/benchmark`）：Core Web Vitals，响应时间
- **认证测试**（`/setup-browser-cookies + /browse`）：导入真实浏览器 Cookie
- **验收报告**（`/qa-only`）：完整 HTML 报告，所有截图

### 使用的 gstack skill（仅 6 个）

forge 只调用测试相关的 6 个 skill，其他 17 个 gstack skill 不使用：

**使用：**
- `/qa`：浏览器测试 + 自动修复
- `/qa-only`：纯报告模式
- `/browse`：浏览器导航、交互、截图
- `/design-review`：视觉 QA
- `/benchmark`：性能测试
- `/setup-browser-cookies`：导入 Cookie

**不使用（gstack 的其他 skill）：**
- `/office-hours`、`/plan-ceo-review`、`/plan-eng-review` 等规划 skill（forge 用 Superpowers brainstorming）
- `/review`（forge 用 Superpowers requesting-code-review）
- `/ship`（forge 有自己的归档流程）
- `/browse` 以外的浏览器 skill

### 对用户的透明度

```
两种模式对用户完全透明：
  - 命令不变（/start、/next、/resume、/done、/bugfix）
  - 流程不变
  - 唯一区别：验收报告的详细程度

用户可以随时切换模式：
  forge config set test_mode enhanced
  forge config set test_mode normal
```

---

## 测试策略

### 测试来源（TDD 的核心）

**原则**：测试不是 AI 自己编的，而是从需求场景生成的。

```
scenarios.md（人确认过的需求场景）
  ↓
writing-plans skill 为每个 task 分配对应的 scenario
  ↓
subagent 执行 task 时，先把 scenario 转成测试代码（红）
  ↓
写实现让测试通过（绿）
  ↓
重构
```

这样测试覆盖的是真实需求，不是 AI 想象的需求。

### 测试层次

**1. 单元测试（TDD）**
- 来源：scenarios.md 的功能场景
- 执行：每个 task 完成后立即运行
- 不通过 → 自动修复（最多 3 轮）

**2. 集成测试（TDD）**
- 来源：scenarios.md 的集成场景
- 执行：每个 batch 完成后运行

**3. 端到端测试（增强模式）**
- 来源：scenarios.md 的 UI 场景
- 工具：gstack `/qa`
- 执行：所有 batch 完成后运行
- 特性：真实浏览器、截图证据、自动修复

**4. 视觉测试（增强模式，有 mockup）**
- 基准：mockup.html 或设计稿截图
- 工具：gstack `/design-review`
- 方法：截图对比 + 80 项视觉审计
- 执行：所有 batch 完成后运行

**5. 性能测试（增强模式，有性能场景）**
- 来源：scenarios.md 的性能场景
- 工具：gstack `/benchmark`
- 指标：Core Web Vitals、响应时间
- 执行：所有 batch 完成后运行

### 测试覆盖率目标

**默认要求：**
- 单元测试覆盖率：≥80%
- 集成测试覆盖率：≥60%
- 端到端测试：所有 P0 scenario

**可配置：**
```json
// .forge/config.json
{
  "test_coverage": {
    "unit": 80,
    "integration": 60,
    "e2e": "P0"
  }
}
```

### 回归测试

**bugfix 流程自动生成回归测试：**

```
/bugfix <bug 描述>
  ↓
确认复现步骤
  ↓
写回归测试（先红，复现 bug）
  ↓
修复 bug（变绿）
  ↓
回归测试加入测试套件，防止未来再次出现
```

---

## 错误处理

### 命令级错误

**`/start`：**
- 需求描述为空 → 报错："请提供需求描述"
- 已有进行中的 feature → 报错："当前有进行中的 feature：xxx，请先完成或取消"

**`/next`：**
- 无当前 feature → 报错："没有进行中的 feature，请先 /start"
- 状态不匹配（如 status: bugfix） → 报错："当前是 bugfix 模式，不支持 /next"

**`/resume`：**
- 无当前 feature → 报错："没有可恢复的 feature"
- progress.json 损坏 → 尝试从 CLAUDE.md 和 git log 重建，失败则报错

**`/done`：**
- 还有未完成 task → 报错："还有 N 个 task 未完成：[task-7, task-9]，请先完成或标记为延期"
- 验证未通过 → 报错："验证未通过，请修复失败的测试"

**`/bugfix`：**
- 描述为空 → 报错："请提供 bug 描述"
- 复现步骤不清楚 → 追问直到清楚

### 执行级错误

**subagent 执行 task 失败：**
- 测试不通过（3 轮修复后）→ 标记 task 为 "failed"，中断 batch，输出错误摘要，提示人工介入
- GitNexus 查询失败 → 警告，继续执行（降级为无依赖分析）
- 文件写入失败 → 立即报错，不继续

**批次级错误：**
- Code review 发现 blocking issue → 中断 batch，输出 review 结果，等待人工修复
- 集成测试失败 → 中断 batch，输出失败测试列表，提示修复

**验证级错误：**
- gstack `/qa` 发现 bug（3 轮修复后仍存在）→ 标记验证失败，输出 bug 列表，等待人工修复
- 性能测试不达标 → 标记验证失败，输出性能指标，建议优化点

### 恢复策略

**progress.json 损坏：**
1. 尝试从 git log 重建：
   - 读取所有 `[forge task-N]` commit
   - 重建 tasks 状态
2. 失败 → 从 CLAUDE.md 读取最后已知状态，警告用户可能不完整

**中断后状态不一致：**
- 例如 progress.json 说 task 5 done，但 git log 里没有对应 commit
- 检测到不一致 → 输出警告，询问用户："task 5 标记为完成，但未找到 commit，是否重新执行？"

---

## 第一期 / 第二期

### 第一期（MVP）

**目标**：核心流程可用，普通测试模式

**交付内容：**

**CLI：**
- `forge init`：安装引导、目录结构生成、config.json 初始化
- 检测并引导安装 Superpowers
- 检测并引导安装 GitNexus（旧项目）

**Skill：**
- `/start`：brainstorming → scenarios → 人确认
- `/next`：planning → 批次执行
- `/resume`：恢复定位 → 继续执行
- `/done`：归档
- `/bugfix`：轻量 bug 修复流程

**新增 skill：**
- `scenarios`：生成 Given/When/Then 场景
- `progress-tracking`：状态外化规则
- `session-handoff`：跨 session 恢复

**测试：**
- 单元测试（TDD）
- 集成测试
- 构建验证
- 测试报告（HTML）

**不包含：**
- gstack 集成（第二期）
- 视觉测试（第二期）
- 性能测试（第二期）

---

### 第二期

**目标**：增强测试模式，完整验收流程

**新增内容：**

**gstack 集成：**
- `forge init` 时可选安装 gstack
- 增强测试模式开关（`config.json`）
- 调用 6 个 gstack 测试 skill

**增强测试：**
- 浏览器测试（`/qa`）
- 视觉 QA（`/design-review`）
- 性能测试（`/benchmark`）
- 认证测试（`/setup-browser-cookies`）
- 完整验收报告（`/qa-only`）

**视觉测试基准管理：**
- `.forge/test-baseline/` 目录
- mockup → 基准截图转换
- 截图对比逻辑
- 视觉回归检测

**验收报告生成：**
- HTML 报告模板
- 截图展示
- 性能图表
- 交互式查看

---

## 技术实现细节

### 多平台 Skill 适配

**skill 写一份 markdown，平台适配靠 manifest + bootstrap：**

**Claude Code（.claude-plugin/plugin.json）：**
```json
{
  "name": "forge",
  "version": "1.0.0",
  "skills": [
    {
      "path": "skills/start.md",
      "name": "/start"
    },
    {
      "path": "skills/next.md",
      "name": "/next"
    },
    ...
  ]
}
```

**Codex（.codex-plugin/plugin.json）：**
```json
{
  "name": "forge",
  "skills": [
    {
      "file": "skills/start.md",
      "command": "forge:start"
    },
    ...
  ],
  "bootstrap": "skills/codex-bootstrap.md"
}
```

**codex-bootstrap.md：**
```markdown
Tool name mapping for Codex:
- Claude Code's `Skill` → Codex's `skill`
- Claude Code's `Task` → Codex's `task`
- Claude Code's `TodoWrite` → Codex's `add_task`
```

**OpenCode（.opencode/plugin.json）：**
类似 Codex，tool mapping 在 bootstrap 里定义。

---

### 状态文件格式

**progress.json schema：**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "status"],
  "properties": {
    "version": {
      "type": "string",
      "const": "1.0"
    },
    "feature": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": ["idle", "planning", "executing", "verification_complete", "bugfix"]
    },
    "phase": {
      "type": "string",
      "enum": ["brainstorming", "awaiting_confirmation", "batch_execution", "verification"]
    },
    "total_batches": {
      "type": "integer"
    },
    "current_batch": {
      "type": "integer"
    },
    "batches": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["batch", "status", "tasks"],
        "properties": {
          "batch": {"type": "integer"},
          "status": {
            "type": "string",
            "enum": ["pending", "in_progress", "done", "blocked", "failed"]
          },
          "started_at": {"type": "string", "format": "date-time"},
          "completed_at": {"type": "string", "format": "date-time"},
          "tasks": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["id", "title", "status"],
              "properties": {
                "id": {"type": "integer"},
                "title": {"type": "string"},
                "status": {
                  "type": "string",
                  "enum": ["pending", "in_progress", "done", "failed", "deferred"]
                },
                "commit": {"type": "string"},
                "started_at": {"type": "string", "format": "date-time"},
                "completed_at": {"type": "string", "format": "date-time"}
              }
            }
          }
        }
      }
    },
    "verification": {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": ["pending", "in_progress", "passed", "failed"]
        },
        "test_mode": {
          "type": "string",
          "enum": ["normal", "enhanced"]
        },
        "last_run": {"type": "string", "format": "date-time"},
        "report_path": {"type": "string"}
      }
    },
    "created_at": {"type": "string", "format": "date-time"},
    "updated_at": {"type": "string", "format": "date-time"}
  }
}
```

**config.json schema：**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "test_mode"],
  "properties": {
    "version": {"type": "string", "const": "1.0"},
    "test_mode": {
      "type": "string",
      "enum": ["normal", "enhanced"]
    },
    "gstack_installed": {"type": "boolean"},
    "batch_size": {
      "type": "integer",
      "minimum": 1,
      "maximum": 10,
      "default": 6
    },
    "test_coverage": {
      "type": "object",
      "properties": {
        "unit": {"type": "integer", "minimum": 0, "maximum": 100},
        "integration": {"type": "integer", "minimum": 0, "maximum": 100},
        "e2e": {"type": "string", "enum": ["P0", "P0+P1", "all"]}
      }
    }
  }
}
```

---

## 系统边界总结

**forge 负责：**
```
├── CLI (forge init)
├── 5 个用户命令 skill（/start、/next、/resume、/done、/bugfix）
├── 3 个内部 skill（scenarios、progress-tracking、session-handoff）
├── 工作流编排（Phase 1-6）
├── 状态管理（progress.json、CLAUDE.md）
├── 目录结构约定
└── 多平台 manifest
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
└── gstack（可选）
    ├── /qa（浏览器测试 + 自动修复）
    ├── /qa-only（验收报告）
    ├── /browse（浏览器导航）
    ├── /design-review（视觉 QA）
    ├── /benchmark（性能测试）
    └── /setup-browser-cookies（认证测试）
```

---

## 总结

forge 是一个 orchestration 系统，通过串联 Superpowers、GitNexus、gstack 三个工具，加上 scenarios、progress-tracking、session-handoff 三个补足 skill，实现从需求到可信产出的完整自动化流程。

**核心价值：**
- 测试来自需求场景（人确认过），不是 AI 编的
- 状态存文件，context 永不溢出
- 批次隔离，任意中断可恢复
- 不猜测，不假设，所有不确定的地方问人
- 复用成熟工具，只做 orchestration

**第一期交付普通测试模式，第二期加入 gstack 增强测试，形成完整的可信产出系统。**
