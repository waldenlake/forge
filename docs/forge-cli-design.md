# Forge CLI 设计文档 v2

> 基于 core.md 核心哲学对齐修订
> 核心原则：改变现实的操作属于 Runtime；推理与决策属于 AI。

---

## 一、分工原则（来自 core.md）

```
┌─────────────────────────────────────────────────────┐
│  AI（skill 文件）负责：                               │
│    · 理解需求、提问、头脑风暴          → Reasoning    │
│    · 解读任务、生成代码               → Generation   │
│    · 解读 CLI 输出，决定下一步        → Adaptation   │
│    · 修复失败的测试                   → Reasoning    │
├─────────────────────────────────────────────────────┤
│  CLI（forge-cli）负责：                               │
│    · Phase transition 前置条件验证    → Workflow     │
│    · 状态读写与 schema 校验           → Verification │
│    · 测试执行（不做修复）             → Verification │
│    · Git 操作与 audit trail           → Verification │
│    · Guard 触发计算                   → Workflow     │
│    · Memory file 写入与回读验证       → Verification │
└─────────────────────────────────────────────────────┘
```

**检验标准（设计任何命令前先过这四个问题）：**

1. 这个逻辑依赖 AI 自觉执行吗？→ 是，下沉到 CLI
2. 这个操作改变了"现实"吗？→ 是，必须由 CLI 执行
3. 这个 phase transition 的前置条件是否可机器验证？→ 必须可以
4. 如果这里出错，系统能恢复吗？→ 必须有恢复路径

---

## 二、仓库结构

```
forge/                          ← forge 插件根目录
├── skills/                     ← AI 读取的指令（精简版，调 CLI）
│   ├── start/SKILL.md
│   ├── next/SKILL.md
│   ├── done/SKILL.md
│   ├── bugfix/SKILL.md
│   ├── resume/SKILL.md
│   ├── scenarios/SKILL.md
│   ├── session-handoff/SKILL.md
│   ├── progress-tracking/SKILL.md
│   └── using-forge/SKILL.md
├── schemas/                    ← JSON Schema（Runtime 强制校验）
│   ├── config.schema.json
│   ├── progress.schema.json
│   └── scenarios.schema.json
├── cli/                        ← CLI 源码
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── commands/
│   │   │   ├── init.ts         ← 项目探测与初始化
│   │   │   ├── status.ts       ← 状态读取
│   │   │   ├── phase.ts        ← phase transition（核心）
│   │   │   ├── task.ts         ← task:start / done / fail / defer
│   │   │   ├── test.ts         ← 测试执行（不含修复）
│   │   │   ├── commit.ts       ← git 操作
│   │   │   ├── verify.ts       ← 完整验收
│   │   │   ├── guard.ts        ← guard 检查与记录
│   │   │   ├── memory.ts       ← memory file 读写
│   │   │   ├── audit.ts        ← 审计追踪
│   │   │   └── reset.ts        ← 强制重置到 idle
│   │   ├── state/
│   │   │   ├── progress.ts     ← 读写 progress.json（带 schema 校验）
│   │   │   ├── config.ts       ← 读写 config.json
│   │   │   └── memory.ts       ← 读写 memory file
│   │   └── lib/
│   │       ├── git.ts
│   │       ├── runner.ts       ← 测试执行器
│   │       ├── guard.ts        ← Guard 触发计算
│   │       └── schema.ts       ← ajv 校验
│   ├── install.sh
│   └── dist/                   ← 预编译产物（随插件分发）
├── README.md
└── .claude-plugin
```

---

## 三、CLI 命令设计

所有命令默认输出 JSON，调试时加 `--human` 输出可读格式。

---

### 3.1 初始化：`forge init`

> **职责**：CLI 自己完成所有探测与写入。
> AI 只触发命令、展示结果、询问用户是否确认。
> （v1 问题：探测逻辑在 skill 文件里，写入是现实操作，必须属于 Runtime）

```bash
# 全自动探测（推荐，/start 首次运行时使用）
forge init --auto-detect [--superpowers-available true|false]

# 手动覆盖（用户不满意探测结果时）
forge init \
  --project-type existing|new \
  --memory-file CLAUDE.md \
  --test-framework vitest \
  --test-command "npx vitest run"
```

`--superpowers-available` 由 AI 在 skill 文件里探测后传入，
因为 Superpowers 是否可用需要感知对话上下文（`<EXTREMELY_IMPORTANT>` 标记），
这是 Reasoning，保留在 skill 侧；但写入 config.json 的动作属于 Runtime。

```jsonc
// 成功输出
{
  "ok": true,
  "detected": {
    "project_type": "existing",
    "test_framework": "vitest",
    "test_command": "npx vitest run",
    "memory_file": "CLAUDE.md",
    "superpowers_available": true,
    "gitnexus_available": false,
    "gstack_available": false
  },
  "created": [".forge/", ".forge/specs/", ".forge/config.json", "CLAUDE.md"],
  "forge_cli_version": "0.2.0"
}
```

AI 读取 `detected`，向用户展示并确认。用户如需修改，AI 再次调用
`forge init` 传入覆盖参数。

---

### 3.2 状态读取：`forge status`

> **职责**：读取 Canonical State，输出当前系统现实。

```bash
forge status
```

```jsonc
{
  "status": "executing",
  "feature": "user-auth-jwt",
  "progress": { "completed": 4, "total": 9 },
  "next_task": { "id": 5, "title": "Add refresh token endpoint" },
  "guard": { "due_at_task": 6, "tasks_until_guard": 2 },
  "verification": { "status": "pending" },
  "phase_transition_available": false,  // 还有任务未完成
  "cli_version_ok": true
}
```

---

### 3.3 Phase Transition：`forge phase:advance`

> **这是 Workflow Layer 在 CLI 里的核心体现。**
> 强制验证每次 phase transition 的前置条件，不满足则拒绝推进。
> （v1 缺失：没有任何命令承担 phase transition 的前置条件验证）

#### 三条 transition 命令

```bash
# planning → executing
# 前置条件：scenarios.json 存在 + 至少一个 P0 + spec_path 已设置
forge phase:advance

# executing → verification_complete
# 前置条件：所有 task 状态为 done 或 deferred
forge phase:complete

# verification_complete → idle（配合 /done 使用）
# 前置条件：verification.status = passed
forge phase:finish
```

```jsonc
// phase:advance 成功
{
  "ok": true,
  "from": "planning",
  "to": "executing",
  "checks": {
    "scenarios_exist": true,
    "has_p0_scenario": true,
    "spec_path_set": true,
    "scenarios_count": 12
  }
}

// phase:advance 失败
{
  "ok": false,
  "from": "planning",
  "blocked_by": "no P0 scenario found in scenarios.json",
  "hint": "Run /start to regenerate scenarios, or add a P0 scenario manually"
}

// phase:complete 失败
{
  "ok": false,
  "from": "executing",
  "blocked_by": "tasks not finished",
  "pending_tasks": [
    { "id": 6, "title": "Add logout endpoint", "status": "pending" },
    { "id": 7, "title": "Write integration tests", "status": "in_progress" }
  ]
}
```

---

### 3.4 任务管理：`forge task:*`

> **职责**：状态登记（写入合同），不含任何业务逻辑判断。

```bash
# 标记任务开始
forge task:start --id 5
```
```jsonc
{
  "ok": true,
  "task": { "id": 5, "title": "Add refresh token endpoint", "status": "in_progress" },
  "started_at": "2026-05-25T10:30:00Z"
}
```

```bash
# 标记任务完成（内部触发 Guard 检查）
forge task:done --id 5
```
```jsonc
{
  "ok": true,
  "completed": 5,
  "total": 9,
  "guard_triggered": true,
  "guard_type": "batch-review",
  "guard_covers_tasks": [1, 2, 3, 4, 5]
}
```

```bash
# 标记任务失败
forge task:fail --id 5 --reason "Tests still failing after 3 rounds of fixes"
```
```jsonc
{
  "ok": true,
  "task": { "id": 5, "status": "failed" },
  "reason": "Tests still failing after 3 rounds of fixes"
}
```

```bash
# 标记任务延迟
forge task:defer --id 7 --reason "Out of scope for this iteration"
```
```jsonc
{
  "ok": true,
  "task": { "id": 7, "status": "deferred" }
}
```

---

### 3.5 测试执行：`forge test`

> **职责**：运行测试，输出现实结果。不做任何修复。
> （v1 修改：删除 `--max-rounds`，CLI 不内置自动修复）
>
> **原因**：修复代码是 Reasoning，属于 AI Layer。
> CLI 只负责执行并出具 verification artifact。
> 重试次数由 skill 文件里的循环逻辑控制（Workflow 纪律），
> 每次修复由 AI 完成，每次验证由 CLI 完成。

```bash
forge test [--coverage]
```

```jsonc
// 成功
{
  "ok": true,
  "passed": 142,
  "failed": 0,
  "coverage": { "unit": 84.2, "integration": 67.1 },
  "duration_ms": 4230
}

// 失败（AI 拿到详情，自己决定如何修复）
{
  "ok": false,
  "passed": 138,
  "failed": 4,
  "failures": [
    {
      "file": "src/auth.test.ts",
      "test": "refreshToken returns 401 when expired",
      "error": "Expected 401, received 200",
      "line": 47
    }
  ],
  "duration_ms": 3810
}
```

**skill 文件里的重试逻辑（Workflow 纪律，保留在 skill 侧）：**

```markdown
运行测试：
```bash
forge test --coverage
```

- ok: true → 继续提交
- ok: false → AI 分析 failures，修复代码，重新调用 forge test
- 最多循环 3 次，第 3 次仍 ok: false → 调用 forge task:fail，STOP
```

---

### 3.6 完整验收：`forge verify`

> **职责**：执行完整验收（测试 + 构建 + 覆盖率），
> 结果写入 progress.json verification 字段。
> 对应 /next Scenario C。

```bash
forge verify [--coverage]
```

```jsonc
// 成功
{
  "ok": true,
  "tests": { "passed": 142, "failed": 0 },
  "build": { "ok": true, "command": "npm run build" },
  "coverage": {
    "unit":        { "value": 84.2, "target": 80, "ok": true },
    "integration": { "value": 67.1, "target": 60, "ok": true }
  },
  "promoted": true,    // verification.status 已写入 passed
  "report_path": ".forge/verification-2026-05-25.json"
}

// 失败
{
  "ok": false,
  "tests": { "passed": 138, "failed": 4 },
  "build": { "ok": true },
  "coverage": {
    "unit": { "value": 72.1, "target": 80, "ok": false }
  },
  "failures": [...],
  "promoted": false    // verification.status 写入 failed
}
```

---

### 3.7 Git 操作：`forge commit` / `forge commit:check`

```bash
# 提交（写入 audit trail）
forge commit --message "Add refresh token endpoint" --tag "forge task-5"
# 等价：git add -A && git commit -m "feat: Add refresh token endpoint [forge task-5]"
```
```jsonc
{
  "ok": true,
  "hash": "a3f9c12",
  "message": "feat: Add refresh token endpoint [forge task-5]"
}
```

```bash
# 验证 task-N 是否有对应 commit（/resume 一致性检查时使用）
forge commit:check --task-ids 1,2,3,4
```
```jsonc
{
  "consistent": [1, 2, 3],
  "missing": [4],
  "details": {
    "1": { "hash": "a1b2c3d", "message": "feat: ... [forge task-1]", "at": "..." },
    "4": null
  }
}
```

---

### 3.8 Guard：`forge guard:check` / `forge guard:record`

```bash
# 查询是否需要触发 Guard（forge task:done 内部自动调用，也可手动查询）
forge guard:check
```
```jsonc
{
  "triggered": true,
  "type": "batch-review",
  "tasks_covered": [1, 2, 3, 4, 5],
  "action": "spec-compliance-review",
  "config": { "every_n_tasks": 6 }  // 来自 config.json
}
```

```bash
# 记录 Guard 执行结果（无论通过或失败，都要记录）
forge guard:record \
  --type batch-review \
  --status passed|failed \
  --tasks 1,2,3,4,5 \
  [--notes "Minor issues found and resolved"]
```
```jsonc
{
  "ok": true,
  "guard_id": "guard-1",
  "guard_history_count": 1
}
```

---

### 3.9 Memory File：`forge memory:*`

> **职责**：写入后强制回读验证（来自 /done Step 2.5 的教训）。

```bash
# 更新 Current Feature 区块（session-handoff 使用）
forge memory:set-feature \
  --feature "user-auth-jwt" \
  --progress "5/9" \
  --next-task-id 6 \
  --next-task-title "Add logout endpoint"
```
```jsonc
{
  "ok": true,
  "verified": true,       // 写入后回读确认，verified: false 时返回 error
  "file": "CLAUDE.md"
}
```

```bash
# 将功能移入 Completed Features（/done 使用）
forge memory:complete-feature \
  --feature "user-auth-jwt" \
  --date "2026-05-25" \
  --tasks "9/9" \
  --deferred 0 \
  --spec "docs/superpowers/specs/2026-05-25-user-auth-jwt-design.md" \
  --plan "docs/superpowers/plans/2026-05-25-user-auth-jwt.md" \
  --scenarios ".forge/specs/user-auth-jwt-scenarios.json"
```
```jsonc
{
  "ok": true,
  "verified": true,
  "file": "CLAUDE.md"
}
```

---

### 3.10 Audit Trail：`forge audit`

> **新增**：对应 core.md Audit Invariant。
> 从 git history + progress.json 重建完整状态变更时间线。
> 同时是 /resume 一致性检查的底层支撑。
> （v1 缺失：没有统一的审计追踪命令）

```bash
forge audit [--feature user-auth-jwt]
```
```jsonc
{
  "feature": "user-auth-jwt",
  "timeline": [
    { "type": "phase_advance", "from": "planning",  "to": "executing",           "at": "2026-05-25T09:00:00Z" },
    { "type": "task_start",    "id": 1, "title": "Set up project structure",     "at": "2026-05-25T09:05:00Z" },
    { "type": "task_done",     "id": 1, "commit": "a1b2c3d",                     "at": "2026-05-25T09:42:00Z" },
    { "type": "task_done",     "id": 2, "commit": "b2c3d4e",                     "at": "2026-05-25T10:15:00Z" },
    { "type": "task_done",     "id": 3, "commit": "c3d4e5f",                     "at": "2026-05-25T10:58:00Z" },
    { "type": "guard",         "guard_id": "guard-1", "type": "batch-review",
                               "status": "passed", "tasks": [1,2,3],             "at": "2026-05-25T11:10:00Z" },
    { "type": "task_done",     "id": 4, "commit": "d4e5f6g",                     "at": "2026-05-25T11:45:00Z" }
  ],
  "inconsistencies": []   // 有则列出，/resume 用于一致性校验
}
```

---

### 3.11 Schema 验证：`forge schema:validate`

```bash
forge schema:validate --file .forge/progress.json
forge schema:validate --file .forge/scenarios.json
forge schema:validate --file .forge/config.json
```
```jsonc
// 成功
{ "ok": true, "file": ".forge/progress.json" }

// 失败
{
  "ok": false,
  "file": ".forge/progress.json",
  "errors": [
    { "path": "/status", "message": "must be one of: idle, planning, executing, verification_complete, bugfix" },
    { "path": "/tasks/2/status", "message": "must be one of: pending, in_progress, done, failed, deferred" }
  ]
}
```

---

### 3.12 强制重置：`forge reset`

> **职责**：提供系统永远有出口的保证（Recovery Invariant）。

```bash
forge reset --backup
```
```jsonc
{
  "ok": true,
  "backup": ".forge/backups/progress-2026-05-25T10:30:00Z.json",
  "status": "idle",
  "message": "State reset to idle. Run /start to begin a new feature."
}
```

---

## 四、Skill 文件改造原则

改造后的 skill 文件只做三件事：

```
1. 调用 CLI 命令
2. 解读 JSON 输出
3. 决定下一步（或向用户汇报）
```

**以 /next execute 为例（改造后）：**

```markdown
对每个 pending 任务：

1. 标记开始：
   ```bash
   forge task:start --id <id>
   ```
   ok: true → 继续；ok: false → 输出错误，STOP

2. 调用 Superpowers subagent-driven-development 实现任务。
   （AI 在这里充分发挥推理能力，Runtime 不干预）

3. 运行测试：
   ```bash
   forge test --coverage
   ```
   - ok: true → 继续提交
   - ok: false → 分析 failures，修复代码，重新运行测试
   - 最多修复 3 次，仍失败 → 调用 forge task:fail，输出失败详情，STOP

4. 提交并标记完成：
   ```bash
   forge commit --message "<task-title>" --tag "forge task-<id>"
   forge task:done --id <id>
   ```
   解读 task:done 输出：
   - guard_triggered: false → 继续下一个任务
   - guard_triggered: true → 执行 Guard 流程（见下方）

5. Guard 流程（仅在 guard_triggered: true 时）：
   调用 Superpowers requesting-code-review（AI 执行 review）
   ```bash
   forge guard:record --type batch-review --status passed|failed --tasks <ids>
   ```
   - passed → 继续执行
   - failed → 输出 Guard 失败详情，STOP，等待用户

所有任务完成后 → 调用 forge phase:complete，推进到验收阶段。
```

---

## 五、完整调用链示例

```
用户: /next
  │
  ├─ forge status
  │    → { status: "executing", next_task: { id: 5 }, guard: { due_at_task: 6 } }
  │
  ├─ forge task:start --id 5
  │    → { ok: true }
  │
  ├─ [AI] Superpowers subagent 实现 task 5
  │    （AI 自由推理，生成代码，Runtime 不干预）
  │
  ├─ forge test --coverage
  │    → { ok: false, failed: 2, failures: [...] }
  │
  ├─ [AI] 分析失败，修复代码（第 1 次）
  │
  ├─ forge test --coverage
  │    → { ok: true, passed: 142 }
  │
  ├─ forge commit --message "Add refresh token" --tag "forge task-5"
  │    → { ok: true, hash: "a3f9c12" }
  │
  ├─ forge task:done --id 5
  │    → { ok: true, completed: 5, guard_triggered: true, guard_type: "batch-review" }
  │
  ├─ [AI] Superpowers requesting-code-review（执行 Guard review）
  │
  ├─ forge guard:record --type batch-review --status passed --tasks 1,2,3,4,5
  │    → { ok: true }
  │
  ├─ forge task:start --id 6 ...（继续）
  │
  └─ [所有任务完成后]
       forge phase:complete
         → { ok: true, from: "executing", to: "verification_complete" }
       forge verify --coverage
         → { ok: true, promoted: true }
       [AI] 提示用户运行 /done
```

---

## 六、v1 → v2 变更汇总

| 命令 | 变更 | 原因（对应哲学原则） |
|------|------|-------------------|
| `forge test --max-rounds` | 删除此参数，CLI 不做自动修复 | 修复是 Reasoning，属于 AI |
| `forge init` | 改为 `--auto-detect`，CLI 自己探测 | 探测+写入是现实操作，属于 Runtime |
| `forge phase:advance/complete/finish` | **新增** | Workflow Layer 核心职责：phase transition 前置条件验证 |
| `forge audit` | **新增** | Audit Invariant 落地 |
| skill 文件探测逻辑 | 全部删除，改调 `forge init --auto-detect` | 写入 config 是现实操作 |
| skill 文件重试循环 | 保留在 skill 侧 | 重试次数是 Workflow 纪律，不是 Reasoning |

---

## 七、分发策略

### 插件结构

```
forge-plugin/
├── skills/          ← AI 指令（精简版）
├── schemas/         ← JSON Schema
├── cli/
│   ├── dist/        ← 预编译 Node.js（随插件分发，无需用户 npm install）
│   │   └── index.js
│   ├── install.sh
│   └── package.json
└── .claude-plugin   ← 插件声明 + install 钩子
```

**.claude-plugin：**
```json
{
  "name": "forge",
  "version": "0.2.0",
  "skills": ["skills/*/SKILL.md"],
  "install": {
    "script": "cli/install.sh",
    "description": "Install forge CLI"
  }
}
```

### install.sh

```bash
#!/bin/sh
PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLI_DIR="$PLUGIN_DIR/cli"

# 检查 Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js required. Install from https://nodejs.org"
  exit 1
fi

# 在项目目录创建包装脚本
FORGE_BIN="$(pwd)/.forge/bin/forge"
mkdir -p "$(pwd)/.forge/bin"

cat > "$FORGE_BIN" << EOF
#!/bin/sh
node "$CLI_DIR/dist/index.js" "\$@"
EOF
chmod +x "$FORGE_BIN"

echo "✓ forge CLI installed: $FORGE_BIN"
echo "  node: $(node --version)"
```

### CLI 调用约定（skill 文件内置）

```bash
# skill 文件调用任何 forge 命令前先执行
FORGE_CMD=$(command -v forge 2>/dev/null \
  || echo ".forge/bin/forge")
```

优先级：全局 `forge` → 本地 `.forge/bin/forge` → 插件目录绝对路径。

### 版本校验

```bash
forge --version
# → { "version": "0.2.0", "compatible": true }
```

config.json 记录 `forge_cli_version`，每次启动时校验，不匹配则提示更新。

### CI 集成

```yaml
# .github/workflows/forge-validate.yml
- name: Validate forge state files
  run: |
    forge schema:validate --file .forge/progress.json
    forge schema:validate --file .forge/scenarios.json
    forge audit --feature $FEATURE
```

---

*forge-cli-design v2 · 与 core.md 核心哲学对齐*
