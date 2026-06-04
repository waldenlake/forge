# Forge Context 管理设计

> Spec · 2026-06-04
> 基于在 OpenCode 上对 ut-5 项目跑完一个完整 forge feature(7 task,171 消息,28 subagent,最终 context 162,688 tokens)的实测结果。

---

## Overview

### 问题定义

在 OpenCode 上严格遵守 forge 设计跑完一个理想 feature 后,主线程 context 仍然增长到 **162,688 tokens(81% of 200k)**。每 task 主线程平均消耗 5–14k tokens,导致约第 10 个 task 之后必爆——即便 forge 设计被严格执行,大 feature 也撑不完。

### 根因(实测分类)

| 类别 | tokens | 占比 | 性质 |
|---|---:|---:|---|
| 平台基线(系统提示+工具定义+AGENTS.md) | ~39k | 24% | 不可消除 |
| **bash 测试输出**(14 次 pytest,单次最高 11k 字符) | ~14k | 9% | **可消除 80%** |
| **read 文件**(40k 字符,2-3× 重复) | ~10k | 6% | **可消除 50%** |
| skill 加载(9 次,一次性) | ~18k | 11% | 一次性投入 |
| subagent prompt + 返回 | ~23k | 14% | 已在控制中,需契约 |
| **agent 累积叙述/工具调用记录** | ~54k | 33% | **跨 task 可压缩** |
| bash 其它(forge_cli/git/env) | ~5k | 3% | 已较少 |

### 设计目标

让任意大小的 feature 在固定 context 窗口下跑得完。把每 task 主线程残留从 ~5–14k 压到 ~1–3k,把累积增长曲线从陡峭线性变成接近平坦,在压缩边界把"forge 状态指针"作为种子注入,使压缩或 session 切换后能精准 `/resume`。

### 设计哲学

forge 的核心信条已经包含答案,只是没贯彻到底:**State as Contract**——工作流的关键状态写入文件,任何压缩或 session 切换都无法丢失。本设计的方向不是新机制,而是贯彻已有信条:

1. **主线程是状态机,不是工作机** — 不读源码、不跑测试、不做实现
2. **大输出落盘回指针** — JSON 摘要进 context,详情存盘按需取
3. **跨 task 不留痕** — 每个 task 完成后,该 task 的工具调用记录对下一个 task 没有任何价值,应主动清除

这三条都不依赖任何特定平台,但配合各平台的压缩/钩子机制,可以让"自动 session 交接"在能做到的平台上做到自动,在做不到的平台上做到最大化的近似。

---

## Architecture

### 插件化 + 两条链路 + 共享状态基础

context 管理被封装成一个**可插拔插件**(Component 9),与 forge 核心 5-phase 解耦——可一键开关、可换策略。启用后,它在 task 边界基于确定性的占用读取(context:usage)介入,收敛为**两条链路**,共享同一份状态载体(handoff.md):

```
              forge 核心(不变):task:done 后暴露 context 检查点
                              │
              context-manager 插件(可开关 enabled)
                              │
                  forge context:usage(跨平台占用读取 + 终端能力探测)
                              │
              usage_pct 越阈值 → 按 strategy + 终端能力决策
                              │
         ┌────────────────────┴────────────────────┐
         ▼                                          ▼
  链路 A:清空重启(干净)                       链路 B:手动 compact(原地/脏)
  首选 原地清空(不换窗口):                    用户确认后 /compact
    OpenCode  → session.new + 注入 /resume       forge 提示 + PreCompact 种子
    tmux/Wez  → send-keys /clear + 恢复命令       压缩后 /resume 重锚定
  兜底 开新窗口(仅 wt.exe,需切窗口):
    wt new-tab + --append handoff
         │                                          │
         └──────────────┬───────────────────────────┘
                        ▼
              共享:.forge/handoff.md(状态种子)
                     progress.json(真相源)
                     SessionStart auto-resume(已实现,复用)
```

**关键定位**:
- forge **不程序化压缩、不自行清空**——核心只在 task 边界暴露一个检查点;插件读占用、做决策、在 agent idle 时执行动作
- 链路 A **首选"原地清空重启"**(不换窗口,真正无缝);仅 wt.exe 因不支持 send-input 退化为开新窗口
- 链路 B 是裸终端/用户偏好的退路:原地但上下文脏
- 全部判定确定性(读 usage + 探测终端),不靠 agent 自我感知

### 三层结构

```
┌─────────────────────────────────────────────────────────────┐
│ 第 3 层:context-manager 插件(可开关)+ 两条链路              │
│   链路 A 清空重启:in-place(session.new / send-keys)首选     │
│                   new-window(wt.exe)兜底                     │
│   链路 B 手动 compact:forge 提示 + 用户 /compact + 种子注入  │
└──────────────────────────┬──────────────────────────────────┘
                           │ task 边界触发,context:usage 判断
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 第 2 层:清空/压缩/切换的种子注入(内容相同)                   │
│   - handoff.md 作为种子(注入恢复命令 / PreCompact)            │
│   - SessionStart auto-resume(已实现,复用)                    │
│   - 项目根 CLAUDE.md/AGENTS.md 始终保留 forge WORKFLOW_RULES  │
└──────────────────────────┬──────────────────────────────────┘
                           │ 状态文件契约
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 第 1 层:跨平台通用(纯 forge CLI / skill,无平台依赖)          │
│   A. 大输出落盘 + 摘要回传(forge test/verify/scanners)        │
│   B. 主线程 read 配额 + 不重复读                              │
│   C. subagent 返回契约(只回 status+commit+report_path)       │
│   D. 主线程 edit/write 禁令(在 task:done 时检测违例)          │
│   E. .forge/handoff.md 自动维护(每 task:done 写一次)          │
│   F. forge context:usage(跨平台占用读取,插件决策基础)         │
└─────────────────────────────────────────────────────────────┘
```

### 优先级

第 1 层 → 第 2 层 → 第 3 层。第 1 层有立即收益且与平台无关,**即使不装 context-manager 插件也生效**;第 2 层把 forge 状态变成"清空/压缩之后能恢复"的种子;第 3 层是插件 + 两条链路,可开关。

### 与现有架构的关系

- **CLI Runtime**(`cli/src/`):是真相源,所有写操作走 CLI。本设计扩展 `forge test` / `forge verify` 加 `--summarize` 模式;`task:done` 命令额外维护 `handoff.md`;新增 `forge handoff:get/write` 子命令。
- **Skills**(`skills/`):是指令文本,本设计在 `forge_executing` 加红色规则块(read/edit/write 禁令),在 `subagent-driven-development` 调用点加返回格式契约。
- **Hooks**(`hooks/`):本设计扩展 `hooks/session-start` 注入 handoff 内容;新增 `hooks/pre-compact`(Claude Code)和 plugin hook(OpenCode)。

---

## Components and Interfaces

### Component 1: forge test --summarize / forge verify --summarize

**职责**:CLI 内部跑测试/构建,大输出落盘到 `.forge/reports/`,只回结构化摘要 JSON。

**接口**:

```bash
$ forge test --summarize [--profile <name>] [--all-profiles]
{
  "ok": true,
  "passed": 35,
  "failed": 2,
  "skipped": 0,
  "duration_ms": 12340,
  "failures": [
    { "test": "test_auth_invalid_token", "file": "test_auth.py:45",
      "error": "expected 401, got 200" }
  ],
  "report_path": ".forge/reports/test-2026-06-04T15-10-22.log"
}
```

**实现要点**:
- `failures[]` 最多保留 5 个,溢出的只在报告文件里
- 每个 failure 的 `error` 截断到 200 字符
- 报告文件包含完整 stdout + stderr + 退出码

### Component 2: 主线程 read/edit/write 禁令

**职责**:通过 skill 指令约束 + CLI 校验,确保主线程是"状态机不是工作机"。

**接口(skill 文档)**:在 `forge_executing/SKILL.md` 加规则块:

```markdown
## ⛔ 主线程硬约束(违反则 task:done 拒绝)

主线程在 task 期间:
- 禁止使用 edit / write / patch — 实现工作必须由 implementer subagent 完成
- 禁止使用 read 读取源代码、测试、spec/plan 全文 — 这些路径传给 subagent 自己读
- 禁止使用 bash 跑测试 / 构建 — 必须走 forge test --summarize / forge verify --summarize
- 主线程允许的工具:status 查看、forge_cli 命令、subagent 派发、status 摘要展示
```

**接口(CLI 校验,第二阶段)**:`forge task:done --id <N>` 调用 OpenCode SDK 反查本 task 期间(`task:start` 到 `task:done` 之间)主 session 的 part 列表,若发现 edit/write/patch 工具调用且不在已知 subagent session 列表里,拒绝完成 task 并返回:

```json
{ "ok": false, "error": "main session edit/write detected during task N",
  "violations": [{ "tool": "edit", "file": "src/foo.py", "msg_id": "..." }],
  "recovery": "implementer subagent must own all implementation work" }
```

**实现要点**:
- 第一阶段只做 skill 文档约束,立即生效
- 第二阶段做 CLI 校验,需要平台特定实现(OpenCode 用 SDK,Claude Code 留 TODO)

### Component 3: Subagent 返回契约

**职责**:固化 subagent 返回格式,防止 implementer/reviewer 退化成"啰嗦的回执"。

**接口(在 `subagent-driven-development` 调用点的 prompt 模板末尾追加)**:

```
## Return Format (REQUIRED)

Reply MUST end with this exact block, nothing after it:

  STATUS: [DONE|BLOCKED|FAILED]
  COMMIT: <git sha or "none">
  REPORT: <path to detailed log if any, or "none">
  SUMMARY: <one line, max 200 chars>

If you have detailed findings, write them to a file under .forge/reports/
and reference the path in REPORT. Do NOT include detailed content in this reply.
```

**实现要点**:
- 此规则进入 subagent 的 prompt(由 `forge_executing` 派发时拼接)
- 主线程在收到 subagent 返回后,只解析这 4 个字段,其它内容丢弃
- 若需要详情,主线程**不直接读** REPORT 路径——只在用户明确要求或路由判断需要时才读

### Component 4: .forge/handoff.md 维护

**职责**:在每个 task:done 之后,自动维护一份"我在哪、下一步是什么"的最小恢复文档,作为压缩种子和 SessionStart auto-resume 的源数据。

**接口**:

`forge task:done` 内部调用,无 CLI 用户接口。文件格式:

```markdown
# Forge Handoff
<!-- auto-generated by forge task:done at 2026-06-04T15:10:22Z -->

Feature:    ecommerce-checkout
Status:     executing
Tasks:      6/20 done (deferred: 0)
Last task:  6 — Implement checkout step 6
Last commit: a3b2c1f (forge task-6)

Next task:
  id:    7
  title: Implement checkout step 7 with payment validation
  scenarios: S007, S008
  spec:  docs/superpowers/specs/2026-06-04-ecommerce-checkout-design.md

Resume command: /resume
```

**实现要点**:
- 每次 task:done 完整重写,不是追加
- 同时新增 `forge handoff:get` 命令供 hook/skill 读取
- feature 完成后(`/done` 阶段),清空或归档 handoff.md

### Component 5: 链路 A — 原地清空重启(in-place restart)

**职责**:在 task 边界,**在当前窗口原地清空 session 上下文,然后自动恢复工作流**。首选"原地清空"(不换窗口),仅在原地不可行时退化为"开新窗口"。两种方式得到的都是干净上下文——不是压缩出来的脏上下文。

**评估时机(关键)**:context 阈值**只在 `task:done` 之后、领取下一个 task 之前**评估,绝不在 task 中途。这是唯一的干净检查点——代码已 commit、progress.json 已更新、handoff.md 刚写好,清空不会丢失任何半完成工作。

**能力矩阵(原地清空 = send-input/SDK 能力,与"开新窗口"是两个不同能力)**:

| 环境 | 原地清空(首选) | 机制 | 开新窗口(兜底) |
|---|---|---|---|
| **OpenCode**(任意终端) | ✅ 最优 | `tui.executeCommand("session.new")` → `appendPrompt("/resume")` → `submitPrompt()`,SDK 原生,不模拟键盘 | `session.create` |
| **Claude Code + tmux** | ✅ | `tmux send-keys -t <当前pane> "/clear" Enter` → 延迟 → 发恢复命令 Enter | `tmux new-window` |
| **Claude Code + WezTerm** | ✅ | `wezterm cli send-text --pane-id <当前>` 发 `/clear` + 恢复命令 | `wezterm cli spawn` |
| **Claude Code + wt.exe** | ❌ 原地不行(send-input 是 microsoft/terminal#9368,仍 open) | — | ✅ `wt new-tab`(退化为开新窗口) |
| 裸终端(无复用器) | ❌ | — | ❌ → 降级到链路 B |

**run-loop 集成(决策归 CLI,不靠 AI 判断)**:

```
forge_executing 完成 task N(task:done)→ 返回 /next 循环
        │
   /next → forge run-loop → executing 阶段计算下一步:
     检测到"上一个 task 刚完成" → 调 forge context:usage
        │
        ├─ usage_pct ≤ 阈值 → 正常返回 invoke-skill forge_executing(下一个 task)
        │
        └─ usage_pct > 阈值 AND fresh_session_advised AND 距上次 handoff 已完成 ≥1 task
              → 返回 action: "handoff-session" + method(in-place | new-window)
                     │
              context-manager 插件分派(见 Component 9):
                ① 在 agent idle 时刻(Stop / session.idle hook),由脱离的后台进程发起
                ② 原地清空:OpenCode 走 SDK 三步;tmux/WezTerm 走 send-keys/send-text
                ③ 清空后补发恢复命令,使新上下文自动 /resume(解决坑 1)
                     │
              清空后的 session(或新窗口)→ SessionStart auto-resume → /resume
                → /next → run-loop → 从 task N+1 继续(干净上下文)
```

**坑 1 — 清空后是空会话,必须补一脚使其自动跑**:
- send-keys 只发 `/clear` 不够——清空后停在提示符等输入。必须**紧接着再发一条恢复命令**(`/clear` Enter → 延迟 → `/resume` 或 forge 续跑 prompt Enter)。
- OpenCode 同理:`session.new` 后必须 `appendPrompt("/resume")` + `submitPrompt()` 把恢复喂进去。
- **利好(Claude Code)**:现有 `hooks.json` 的 SessionStart matcher 已含 `clear`,`/clear` 会触发 SessionStart 自动重注入 using-forge + auto-resume。补发的恢复命令只是"踢一下让 agent 开始动"。

**坑 2 — 时机必须在 agent 停下时,且有残留风险(需真机验证)**:
- 清空/注入动作必须在 agent **完全让出 pty** 之后到达,否则命令落进缓冲区不执行。
- 必须由 **agent 回合结束** 的钩子触发(Claude Code `Stop` hook / OpenCode `session.idle` 事件),钩子里 spawn 一个**脱离的后台进程**(`nohup ... &`)带小延迟再发命令。
- ⚠️ **残留风险**:Stop hook 触发时刻与"提示符真正就绪"之间有微小窗口,延迟值是环境相关的,必须**真机实测调参**(见 Testing Strategy 的强制验证任务)。OpenCode 走 SDK,残留风险最低;tmux/WezTerm 走 send-keys,风险略高但有社区先例。

**防 handoff 循环**:新上下文清空后 context 低,`context:usage` 不会立即再触发;额外保险——**距上次 handoff 至少完成 1 个 task 才允许再次 handoff**,由 run-loop 检查 handoff 记录实现。

**自动性说明(诚实)**:
- ✅ **首选(原地清空)是真正无缝的**:不换窗口,原地清空 → 原地恢复,用户视线不动
- ⚠️ **仅 wt.exe 退化为开新窗口**:此时用户视线需切到新 tab(wt.exe 不支持 send-input,这是它的限制)
- forge **不自行执行清空**——只输出 `handoff-session` 动作,由 context-manager 插件(Component 9)在正确时机执行(进程边界清晰)

**实现要点**:
- 终端检测:`$TMUX`(tmux)、`wezterm` 命令存在、`$WT_SESSION`(Windows Terminal)
- 新 session 启动后,其 SessionStart hook 触发 auto-resume(Component 7),从 handoff + progress.json 重新锚定
- handoff 内容十几行,`--append-system-prompt` 注入的初始 context 代价可接受
- forge **不直接开 session**——只输出 `fresh_session_advised`,由 hook 脚本执行(进程边界清晰)

### Component 6: 链路 B — 手动 compact 提示 + 种子注入

**职责**:在不支持终端复用器的环境(典型:裸终端 Claude Code),forge 不程序化触发压缩(平台也不允许),而是**提示用户手动 /compact**,并通过 hook 备好 handoff 种子,确保用户压缩后能精准恢复。

**触发**:`task:done` 之后,若 `usage_pct` 越过阈值且无可用复用器,forge 输出 `compact_advised: true`,skill 据此向用户输出提示。

**接口(skill 提示,遵循 SKILL-UX.md)**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸  Context 占用 81% — 建议在此 task 边界压缩
▸  Next: 运行 /compact,然后 /resume 继续
```

**接口(Claude Code hook,种子注入)**:

`.claude/settings.json`(由 `forge init` 生成):

```json
{
  "hooks": {
    "PreCompact":  [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/cli/dist/index.js handoff:get" }] }],
    "PostCompact": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/cli/dist/index.js handoff:get" }] }]
  }
}
```

项目根 CLAUDE.md / AGENTS.md 的 `## Compact Instructions`(由 `feature:start` 注入,压缩中始终保留):

```markdown
## Compact Instructions

When this conversation is compacted, preserve / recover:
1. Active forge feature & status (from .forge/progress.json)
2. Read .forge/handoff.md for the next task
3. After compaction, run /resume to reload canonical state
```

**接口(可选,调早压缩时机)**:forge 安装文档推荐 Claude Code 用户设:

```bash
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=60     # 默认 ~95% → 60%
export CLAUDE_CODE_DISABLE_1M_CONTEXT=1        # 压缩窗口更紧致
```

**实现要点**:
- forge **不调用** `/compact`(Anthropic 不支持程序化触发,issue #38925/#39149/#54822 全 open)
- forge 只做三件事:提示用户、PreCompact 备种子、PostCompact 重注入
- 即使用户错过提示、系统在 task 中途强制 auto-compact,PreCompact 种子 + SessionStart auto-resume 仍能恢复

### Component 8: forge context:usage —— 跨平台 context 占用读取

**职责**:作为外部进程读取**当前平台落盘的 session 文件**,返回精确的、确定性的 context 占用率。这是两条链路共同的触发基础——什么时候建议开新 session / 建议 compact,都由它判断。不依赖 agent 自我感知,符合 "Runtime 读真相" 哲学。

**接口**:

```bash
$ forge context:usage [--json] [--session <id>]
{
  "ok": true,
  "platform": "opencode",
  "session_id": "ses_16f56a834ffe...",
  "total_context": 161418,
  "window_size": 200000,
  "usage_pct": 0.807,
  "source": "~/.local/share/opencode/opencode.db",
  "last_forge_event": "task:done",
  "fresh_session_advised": true,
  "compact_advised": false
}
```

`fresh_session_advised` / `compact_advised` 二选一由"是否检测到可用终端复用器"决定:有复用器 → 建议开新 session(链路 A);无 → 建议 compact(链路 B)。

**平台分派(两个平台均已实测验证字段格式)**:

| 平台 | session 存储 | 读取方式 | 占用算法(读最后一条 assistant 消息) |
|---|---|---|---|
| **OpenCode** | `~/.local/share/opencode/opencode.db`(SQLite) | 查 `message` 表,按 `session_id` + `time_created` 取最新 assistant | `tokens.input + tokens.cache.read` |
| **Claude Code** | `~/.claude/projects/<encoded-cwd>/<session>.jsonl`(JSONL) | 读文件最后一条含 `usage` 的 assistant 行 | `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` |
| **Codex CLI** | (无已知本地 transcript) | 不支持,返回 `ok:false, reason:"unsupported_platform"` | — |

**实现要点**:
- 平台检测:按环境变量(`CLAUDE_PLUGIN_ROOT` / `OPENCODE_*`)或显式 `--platform` 参数判断
- 当前 session 定位:OpenCode 用 cwd 匹配 `directory` 列取最近活动 session;Claude Code 用 cwd 编码成项目目录名 + 取最新修改的 jsonl
- 终端复用器检测:`$TMUX` / `wezterm` 命令 / `$WT_SESSION` → 决定 `fresh_session_advised` vs `compact_advised`
- `window_size` 按 model 推断(默认 200000;若检测到 1M context 则用 1000000)
- 读取失败时返回 `ok:false` + `reason`,调用方降级
- **这是确定性的、外部的、不依赖 AI 自估的** —— 完全是 forge Runtime 该承担的职责

### Component 7: SessionStart auto-resume(已实现,复用)

**职责**:压缩或新会话启动时,从 progress.json + handoff.md 自动 /resume。

forge 已实现:`using-forge` skill 检测 `status != idle` 自动调用 `/resume`。本设计**不改这部分**,只确认 handoff.md 提供的种子能让 `/resume` 在压缩后或新 session 启动时立刻定位到 next task。新 session(链路 A)和压缩后(链路 B)走的是同一套 auto-resume 逻辑。

### Component 9: context-manager 作为可插拔插件

**职责**:把整个 context 管理能力(占用感知 + 两条链路的执行)封装成一个**独立、可开关、可配置**的插件,与 forge 核心 5-phase 解耦。核心工作流不依赖它即可运行;启用后它在 task 边界介入。

**为什么做成插件**:
- **灵活**:用户可一键开关(裸终端用户、或不想要自动切换的用户可关闭),核心流程不受影响
- **解耦**:占用读取、终端检测、清空/恢复触发这些都是平台相关的"脏活",隔离在插件里,不污染 CLI 核心状态机
- **可替换**:不同用户可换不同策略(激进清空 vs 保守提示),只换插件配置

**插件边界**:

```
┌────────────────────────────────────────────────────┐
│ forge 核心(不变)                                    │
│  run-loop / next-action / task:* / phase:*           │
│  —— 只多产出一个信号:task:done 后的 context 检查点    │
└───────────────────────┬────────────────────────────┘
                        │ 暴露 hook 点:on_task_done
                        ▼
┌────────────────────────────────────────────────────┐
│ context-manager 插件(可开关)                         │
│  1. 读 forge context:usage(占用 + 终端能力探测)        │
│  2. 决策:继续 / 原地清空 / 开新窗口 / 提示 compact     │
│  3. 在 agent idle 时刻执行清空+恢复(坑 2 的时序处理)   │
│  4. 防循环计数                                        │
└────────────────────────────────────────────────────┘
```

**配置(`.forge/config.json` 的 `context_management` 段)**:

```json
{
  "context_management": {
    "enabled": true,
    "threshold_pct": 0.50,
    "strategy": "in-place-restart",   // in-place-restart | new-window | prompt-compact | off
    "fallback": "prompt-compact",      // 首选策略不可用时的退路
    "min_tasks_between_handoff": 1
  }
}
```

- `enabled: false` → 插件完全不介入,forge 退回纯核心行为(等于今天)
- `strategy` → 用户选首选链路;插件按终端能力自动校验,不支持则用 `fallback`
- 所有判定仍是确定性的(读 usage + 探测终端),不靠 AI

**实现形态(按平台)**:
- **OpenCode**:作为 `.opencode/plugins/forge.js` 里的一组 hook(`event` 监听 session.idle + SDK 调用),与现有 bootstrap 注入并存
- **Claude Code**:作为 `.claude/settings.json` 里的 `Stop` hook + 脱离的后台脚本(`.forge/hooks/context-manager.sh`)
- 两者共用同一个决策核心 `forge context:usage`(Component 8),平台插件只负责"执行动作"

**实现要点**:
- 插件不持有状态——所有状态读自 progress.json / handoff.md / context:usage,符合 State as Contract
- 插件失败(spawn 失败、send-keys 超时)必须**静默降级**到链路 B(提示),绝不阻断核心工作流
- 插件是 forge 安装的可选组件;`forge init` 询问或按终端环境默认开关

---

## Data Models

### .forge/handoff.md(新增)

Markdown 格式,人类可读,但有固定字段供机器解析:

```yaml
# 字段定义(为 forge handoff:get --json 准备)
feature:        string         # active feature slug
status:         enum           # planning|executing|execution_complete|verified
tasks:          string         # "<done>/<total>"
deferred_tasks: int
last_task:
  id:           int | null
  title:        string | null
  commit:       string | null  # git short sha
next_task:
  id:           int | null
  title:        string | null
  scenarios:    string[]       # e.g. ["S007", "S008"]
spec_path:      string | null
plan_path:      string | null
generated_at:   ISO-8601 string
```

### .forge/reports/(新增目录)

存放 `forge test/verify/guard:*` 的详细输出。每个文件:

```
.forge/reports/test-<ISO timestamp>.log         # 完整 stdout+stderr+exit
.forge/reports/verify-<ISO timestamp>.json      # 完整 verification report
.forge/reports/guard-<type>-<task-range>.log    # guard 详细输出
```

由 forge CLI 维护,生命周期由 `/done` 的 `reset --backup` 处理。

### .forge/config.json 新增字段

```json
{
  "context_management": {
    "compact_threshold_pct": 0.50,
    "main_session_read_quota": 50000,
    "subagent_return_max_chars": 800
  }
}
```

所有字段可选,有默认值。

### Subagent 返回数据契约

```yaml
# 解析自 subagent 返回末尾的固定块
status:   enum           # DONE|BLOCKED|FAILED
commit:   string | null  # git short sha or "none"
report:   string | null  # path or "none"
summary:  string         # max 200 chars
```

---

## Correctness Properties

### Property 1: 主线程不留 task 实现痕迹

**Validates:** Requirements 2.1, 2.3, 2.4

**陈述**:对任意 `task:done` 完成的 task N,主 session 在 `task:start --id N` 到 `task:done --id N` 之间的消息序列中,不应包含 edit/write/patch 工具调用,也不应包含读取源码文件的 read 工具调用。

**验证**:`forge task:done` 校验。第二阶段实现。

### Property 2: handoff.md 与 progress.json 一致

**Validates:** Requirements 4.1, 4.2, 4.4

**陈述**:在任何 forge CLI 命令完成后,`.forge/handoff.md` 反映的 feature/status/tasks 必须与 `.forge/progress.json` 一致。

**验证**:`forge audit` 命令扩展,检查两份文件的关键字段一致;不一致时报告 drift 并提供 `forge handoff:write` 重建。

### Property 3: 压缩后 /resume 能精准恢复

**Validates:** Requirements 4.3, 5.1, 6.1, 6.2, 7.1, 7.2

**陈述**:压缩或新会话启动后,从 handoff.md 种子 + progress.json 真相源,/resume 必须能定位到正确的 next task,且不需要任何对话历史。

**验证**:测试用例——构造一个 progress.json 在 executing 状态的项目,运行 forge handoff:get,确认输出包含完整的 next task 信息。

### Property 4: 第 1 层收益不依赖压缩

**Validates:** Requirements 8.1, 8.2, 8.3

**陈述**:即使压缩从未发生,第 1 层(A-E)的实施也必须独立带来 context 占用降低。

**验证**:在 OpenCode 不启用主动压缩 hook 的情况下,跑相同的 ut-5 风格测试,主线程 context 应低于 100k(对照实测的 163k)。

### Property 5: context:usage 跨平台一致且确定

**Validates:** Requirements 10.1, 10.2, 10.3, 10.6

**陈述**:对同一个真实 session,`forge context:usage` 返回的 `total_context` 必须等于该平台 session 文件中最后一条 assistant 消息的 token 用量之和(OpenCode: input+cache.read;Claude Code: input+cache_creation+cache_read),且两次连续调用对未变化的 session 返回相同结果。

**验证**:对已知的 OpenCode session(ses_16f56a... 实测 162,688)和一个 Claude Code jsonl(实测 ~87.7k)分别运行,断言数值匹配手工计算。

### Property 6: 清空重启后工作流精准续上

**Validates:** Requirements 5.4, 5.5, 5.8, 7.1, 11.7

**陈述**:链路 A 原地清空(或开新窗口)之后,新上下文必须从 handoff + progress.json 恢复到**正确的 next task**,且不重复执行已完成的 task、不跳过未完成的 task。清空动作失败时,必须降级且不破坏 progress.json。

**验证**:在 tmux/WezTerm/OpenCode 真机环境各跑一次:构造 executing 状态(task N done),触发清空重启,断言新上下文 /resume 后从 task N+1 开始;另注入一次"清空命令失败",断言降级到链路 B 且 progress.json 不变。

### Property 7: 插件关闭时核心行为不变

**Validates:** Requirements 11.2, 11.9

**陈述**:`context_management.enabled: false` 时,forge 核心的 run-loop / task / phase 行为必须与未引入本 spec 时**逐字节一致**(除 handoff.md 维护这一无害副作用外)。

**验证**:对同一 progress.json,分别在插件开/关下跑 run-loop,断言返回的 action 序列(除 handoff-session 外)完全相同。

---

## Error Handling

| 场景 | 处理 |
|---|---|
| `forge test --summarize` 内部测试运行失败 | 仍写报告文件,JSON 返回 `ok: false` + `failures[]` + `report_path` |
| `task:done` 检测到主线程违例(第 D 项) | 拒绝完成 task,返回 `violations[]`,要求 implementer subagent 重做该 task |
| handoff.md 写入失败 | 不影响 task:done(handoff 是辅助文件,progress.json 是真相源);记录 warning |
| 链路 A:终端复用器开新 session 失败 | hook 脚本降级到链路 B(提示用户手动 /compact);不阻断 forge 流程 |
| 链路 A:检测不到任何复用器 | `context:usage` 不置 `fresh_session_advised`,自动走链路 B |
| 链路 B:Claude Code PreCompact hook 失败 | 不阻断 forge 流程;`/resume` 仍能从 progress.json 恢复(只是没有 handoff 种子,效率略低) |
| 链路 B:用户错过提示,系统 task 中途强制 auto-compact | PreCompact 注入 handoff,SessionStart auto-resume 重新 /resume;`task:reset` 把 in_progress task 回退到 pending,完整重新执行 |
| `forge context:usage` 读取 session 文件失败 | 返回 `ok:false` + `reason`;两条链路都降级为"不建议"(用户自行判断) |
| `forge handoff:get` 调用时 handoff.md 不存在 | 实时从 progress.json 重建并写入,然后返回 |

---

## Testing Strategy

### 单元测试

- `forge test --summarize`:mock 各种测试输出(全过、部分失败、超长输出、超时),验证 JSON 字段正确、报告文件被写入、failures 截断到 5 个
- `forge handoff:get`:mock progress.json 各状态,验证输出 markdown 格式正确
- `task:done` 维护 handoff:断言每次调用后 handoff.md 内容反映最新状态
- subagent 返回解析:测试缺失字段、字段顺序错乱、超长 SUMMARY 等场景

### 集成测试

- 在 forge-test 风格的隔离工程里跑一个 3-task 的 dummy feature,断言整个流程结束后 `.forge/reports/` 包含正确的报告文件,handoff.md 反映最终状态
- OpenCode plugin hook 测试:模拟 session.idle 事件,断言阈值触发逻辑正确

### 端到端验证(关键)

- 在 OpenCode 上按本 spec 实施完成后,**重跑一次 ut-5 风格的真实 forge 流程**(同样 7 个 task 量级),从 SQLite 读取真实 token 数据,对照下表验证。

### 链路 A 真机时序验证(强制 —— 坑 2 不可纸上结案)

清空/注入的时序(坑 2)是环境相关的,**必须在每种支持环境真机跑通,实测延迟参数**,不能靠断言:

| 环境 | 验证内容 | 期望 |
|---|---|---|
| OpenCode(SDK) | `session.new` → `appendPrompt` → `submitPrompt` 在 session.idle 时触发 | 新 session 自动跑起 /resume,无需人工 |
| Claude Code + tmux | `Stop` hook → 后台 `send-keys /clear` + 恢复命令,延迟从 0.3s 起调 | `/clear` 被执行(非落缓冲),恢复命令随后执行 |
| Claude Code + WezTerm | 同上,`cli send-text` | 同上 |
| Claude Code + wt.exe | 退化为 `wt new-tab`(原地不可行) | 新 tab 启动并 auto-resume |

记录每种环境实测可用的延迟值,写入插件默认配置;任一环境跑不通则文档化并降级到链路 B。

### token 收益对照表

| 项目 | ut-5 实测(改前) | 改后预期 | 验证方式 |
|---|---:|---:|---|
| 平台基线 | ~39k | ~39k | 不变 |
| bash 测试输出 | ~14k | <3k | 统计 bash tool 中 pytest 的输出字节 |
| read 文件 | ~10k | <5k | 统计 read tool 输出字节 |
| 累积叙述+其它 | ~64k | <40k | 反算 |
| **最终 context** | **163k** | **<100k** | 末条 assistant message 的 tokens.cache.read |
| **可跑 task 数** | ~10 | 20+ | 实测能否完整跑完 |

数字达标 = spec 落地成功;不达标 = 重新审视哪一项收益与预期不符。

---

## 八、实施顺序

### 阶段 1:跨平台通用机制(立即,~2-3 天)

1. `forge test --summarize` / `forge verify --summarize` 改造,测试输出落盘
2. `forge_executing` SKILL.md 加 read/edit/write 红色规则块(只是文档约束,不强制)
3. `subagent-driven-development` prompt 加返回格式契约
4. `forge task:done` 维护 `.forge/handoff.md`
5. 新增 `forge handoff:get` 命令

### 阶段 2:平台适配(~2-3 天)

6. OpenCode plugin 加 `experimental.session.compacting` hook,注入 handoff
7. OpenCode plugin 加 `event` hook,阈值触发主动压缩
8. Claude Code `.claude/settings.json` 模板,生成 PreCompact/PostCompact hook
9. `feature:start` 在 CLAUDE.md/AGENTS.md 注入 Compact Instructions 段
10. forge 安装文档加 Claude Code 环境变量推荐(OVERRIDE=60, DISABLE_1M=1)

### 阶段 3:深度治理(~1 周)

11. `forge task:done` 校验主线程未做 edit/write(OpenCode SDK 反查 part)
12. `forge audit` 扩展,检查 handoff/progress 一致性
13. 端到端验证:在 ut-5 风格测试上重跑,对比 token 数据

---

## 风险与不确定性

1. **OpenCode 主动压缩的副作用**:压缩时机若选不准,可能压掉**当前 task 正在用的关键上下文**。缓解:阈值设保守(50% 而非 30%),且只在 `task:done` 后触发,绝不在 task 中途。

2. **Claude Code 压缩时机不可控**:即使设了 `OVERRIDE=60`,压缩还是可能发生在 task 中途。缓解:依赖 PreCompact 钩子保 handoff,SessionStart 钩子重新 /resume,即使中途压缩也能精准恢复。

3. **第 D 项(主线程 edit/write 禁令)的执行难度**:OpenCode 上技术可行(SDK 暴露 session.messages),Claude Code 上要找等价手段。第一阶段先靠 skill 文档约束,第二阶段再做 CLI 校验。

4. **预测数字未经过完整验证**:本设计基于一次 ut-5 实测推算,不同语言/规模的 feature 数字会变。阶段 1 完成后必须重跑 ut-5 风格测试,而不是凭推算结案。

---

## 相关文档

- `docs/forge-current-state.md` — 当前状态权威基点
- `docs/forge-workflow-overview.md` — 5-phase 工作流设计意图
- `docs/Forge-core-philosophy.md` — Runtime 哲学(State as Contract)
- `docs/claude-code-context-management.md` — Claude Code 平台调研报告

实测数据原始记录:

- ut-5 主 session: `ses_16f56a834ffeOuYBvRhQS7S3nu` (cosmic-canyon)
- 7 个 task 全部派发 + final review + holistic review + verify + bugfix
- 28 个 subagent session,平均 peak context 40-50k(隔离有效)
- 最终主线程 context: 162,688 tokens
