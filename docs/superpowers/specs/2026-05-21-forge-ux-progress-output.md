# Forge UX: Progress Output & Environment Guidance Design

## Problem

当前 forge skills 只有逻辑流程，缺乏：
1. 品牌辨识（用户不知道"进入了 forge 流程"）
2. 环境检测引导（缺依赖时报错不友好，不告诉用户怎么装）
3. 进度反馈（用户不知道当前在哪步、已完成什么）

## 设计方案

### 品牌 Header

流程开始时输出一次（仅 `/start` 首次触发）：

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ⚒  F O R G E  v0.1.0               ┃
┃  AI-Driven Development Orchestration  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

其他命令（/next, /resume, /done, /bugfix）不输出完整 header，
只输出一行命令标识：

```
⚒ forge · /next
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 进度输出规范

**阶段标题**（顶层，用 `▸` 前缀）：
```
▸ Phase N · <阶段名>
```

**步骤状态**（缩进 4 格）：
```
    ✓ 已完成的步骤
    → 当前进行中的步骤...
    · 待执行的步骤
    ✗ 失败的步骤 (原因)
```

**符号约定：**
| 符号 | 含义 |
|------|------|
| `✓` | 完成 |
| `→` | 进行中 |
| `·` | 待做 |
| `✗` | 失败 |
| `⚠` | 警告（非致命） |

### 环境检测输出

**全部通过：**
```
▸ Phase 1 · Environment Check
    ✓ Superpowers
    ✓ GitNexus
    · gstack (optional)
    ✓ Test framework: vitest
```

**有必需依赖缺失：**
```
▸ Phase 1 · Environment Check
    ✓ GitNexus
    · gstack (optional)
    ✗ Superpowers (required)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠ Superpowers is required but not found.

  Claude Code:
    /plugin install superpowers@claude-plugins-official

  OpenCode:
    "superpowers@git+https://github.com/obra/superpowers.git"

  Install and run /start again.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

然后 STOP。不继续后续流程。

**可选依赖缺失（不阻塞）：**
- GitNexus 缺失（existing project）→ `⚠ GitNexus (recommended for existing projects)`
- gstack 缺失 → `· gstack (optional)` 即可，不额外提示

### 各命令进度输出

#### /start 完整流程

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ⚒  F O R G E  v0.1.0               ┃
┃  AI-Driven Development Orchestration  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

▸ Phase 1 · Environment Check
    ✓ Superpowers
    ✓ GitNexus
    · gstack (optional)
    ✓ Test framework: vitest
    ✓ Project initialized

▸ Phase 2 · Brainstorming
    → Clarifying requirements...

  [brainstorming 对话在这里发生]

▸ Phase 2 · Brainstorming
    ✓ Requirements clarified
    ✓ proposal.md written

▸ Phase 3 · Scenarios
    → Generating test scenarios...

▸ Phase 3 · Scenarios
    ✓ 8 scenarios generated (5 P0, 2 P1, 1 P2)
    ✓ scenarios.json written
    ✓ scenarios.md written

▸ Ready for Review
    Proposal and scenarios are ready.
    Review scenarios.md, then run /next to proceed.
```

#### /next

```
⚒ forge · /next
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ Phase 4 · Planning
    → Generating implementation plan...
    ✓ full-plan.md written (12 tasks)
    → Cutting batches...
    ✓ 2 batches created (6 + 6)

▸ Phase 5 · Execution (Batch 1/2)
    → Task 1: Create user model...
    ✓ Task 1: done
    → Task 2: Add login endpoint...
```

#### /resume

```
⚒ forge · /resume
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ Status Recovery
    ✓ Feature: user-authentication
    ✓ Progress: batch 2/3, task 8/12
    → Interrupt point: Task 8 (in_progress)

  Resume from Task 8? (yes / no / show-task)
```

#### /done

```
⚒ forge · /done
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ Verification
    ✓ All batches complete (12/12 tasks)
    ✓ Tests passing
    ✓ Coverage: 87% (target: 80%)

▸ Archive
    ✓ Scenarios saved to specs/
    ✓ CLAUDE.md updated
    ✓ Feature archived
    ✓ progress.json cleaned

▸ Complete ✓
    Feature "user-authentication" done.
    Ready for next feature — use /start.
```

#### /bugfix

```
⚒ forge · /bugfix
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ Phase 1 · Bug Analysis
    → Clarifying reproduction steps...

▸ Phase 1 · Bug Analysis
    ✓ Reproduction confirmed
    ✓ Fix plan: 2 tasks

▸ Phase 2 · Fix (TDD)
    → Task 1: Write regression test...
    ✓ Task 1: regression test fails (bug confirmed)
    → Task 2: Implement fix...
    ✓ Task 2: test passes (bug fixed)
    ✓ All tests passing

▸ Complete ✓
    Bugfix "login-special-chars" done.
```

## 影响范围

需要修改的文件：
1. `skills/start/SKILL.md` — 加入 header + 环境检测输出 + 各阶段进度
2. `skills/next/SKILL.md` — 加入命令标识 + 规划/执行进度
3. `skills/resume/SKILL.md` — 加入命令标识 + 恢复状态进度
4. `skills/done/SKILL.md` — 加入命令标识 + 归档进度
5. `skills/bugfix/SKILL.md` — 加入命令标识 + 分析/修复进度

不需要修改的文件：
- `scenarios/SKILL.md`（内部 skill，被 start 调用，进度由 start 输出）
- `progress-tracking/SKILL.md`（内部 skill，进度由 next 输出）
- `session-handoff/SKILL.md`（内部 skill，已有自己的输出格式）
- `using-forge/SKILL.md`（meta-skill，不执行流程）

## 实现原则

1. 进度输出是 skill 文档里的"输出模板"——告诉 AI 在特定时刻输出什么
2. 不是代码，是指令："在完成 X 后，输出以下格式..."
3. 每个阶段转换时更新输出（不是实时刷新，是离散的状态切换）
4. brainstorming 等交互式步骤期间，进度指示器暂停，对话正常进行
