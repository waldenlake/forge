# Forge v2 CLI Runtime — 设计文档

> 日期：2026-05-25
> 分支：feature/v2-cli-runtime
> 状态：已确认，待实现
> 用户决策：采用不兼容路线，`config.json` 升级到 `2.0`，废弃 `test_command` / `test_framework`

---

## 背景

Phase 1 的 Forge 将所有"改变现实"的操作（文件 I/O、测试执行、git 提交、schema 校验、Guard 触发计算）放在 skill 文件里由 AI 执行。这违背了 core.md 的核心原则：

> 改变现实的操作必须由 Runtime 执行，不能由 AI 自报完成。

v2 引入 `forge-cli`，将上述操作全部下沉到 CLI，skill 文件改造为只调用 CLI 并解读 JSON 输出的薄包装层。

---

## 实施范围

v2 第一轮实现聚焦 **CLI Runtime 核心闭环**，目标是让 Forge 的 Reality Authority 从 skill 文件迁移到 Runtime：

- 初始化、状态读取、schema 校验、phase transition、task 状态变更由 CLI 执行。
- 测试、完整验收、git 提交、commit 一致性检查、audit、reset 由 CLI 执行。
- Guard 触发计算和 guard history 写入由 CLI 执行。
- Memory file 写入和回读验证由 CLI 执行。
- Skill 文件只保留：调用 CLI、解读 JSON、调用 Superpowers、处理用户对话。

第一轮不实现完整外部扫描器和视觉测试能力。Phase 2 扩展命令可以提供稳定接口和友好未启用输出，但 `security-scan`、`dependency-audit`、`gstack`、视觉回归、scenarios 模板和 monorepo 深度探测不作为首轮完成标准。

---

## 一、仓库结构

```
forge/
├── skills/                    ← 改造后的 AI 指令层（只调 CLI + 解读输出）
│   ├── start/SKILL.md
│   ├── next/SKILL.md
│   ├── done/SKILL.md
│   ├── bugfix/SKILL.md
│   ├── resume/SKILL.md
│   ├── scenarios/SKILL.md
│   ├── session-handoff/SKILL.md
│   ├── progress-tracking/SKILL.md
│   └── using-forge/SKILL.md
├── schemas/                   ← JSON Schema（扩展，不向后兼容 test_command）
│   ├── config.schema.json
│   ├── progress.schema.json
│   └── scenarios.schema.json
├── cli/                       ← 新增：forge-cli TypeScript 源码
│   ├── package.json
│   ├── tsconfig.json
│   ├── install.sh
│   ├── src/
│   │   ├── index.ts
│   │   ├── commands/
│   │   │   ├── init.ts
│   │   │   ├── status.ts
│   │   │   ├── phase.ts
│   │   │   ├── task.ts
│   │   │   ├── test.ts
│   │   │   ├── verify.ts
│   │   │   ├── commit.ts
│   │   │   ├── guard.ts
│   │   │   ├── memory.ts
│   │   │   ├── audit.ts
│   │   │   ├── reset.ts
│   │   │   ├── schema-validate.ts
│   │   │   ├── doctor.ts
│   │   │   ├── migrate.ts
│   │   │   └── scenarios.ts
│   │   ├── state/
│   │   │   ├── progress.ts    ← 读写 progress.json（含 schema 校验）
│   │   │   ├── config.ts      ← 读写 config.json
│   │   │   └── memory.ts      ← 读写 memory file
│   │   └── lib/
│   │       ├── git.ts
│   │       ├── runner.ts      ← 测试执行器
│   │       ├── guard.ts       ← Guard 触发计算
│   │       ├── schema.ts      ← ajv 校验
│   │       ├── detect.ts      ← 项目探测（测试框架、monorepo）
│   │       └── logger.ts      ← 结构化日志（JSON Lines）
│   └── dist/                  ← tsc 产物（.gitignore）
├── .claude-plugin/plugin.json ← version: 0.2.0
└── README.md
```

---

## 二、CLI 技术选型

- **语言**：TypeScript
- **编译**：`tsc`，产物在 `cli/dist/`（进 .gitignore）
- **分发**：`install.sh` 执行 `npm install --production` + 创建包装脚本
- **CLI 框架**：`commander.js`
- **Schema 校验**：`ajv`
- **输出格式**：默认 JSON，`--human` 输出可读格式

### install.sh 行为

```bash
#!/bin/sh
PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLI_DIR="$PLUGIN_DIR/cli"

# 1. npm install --production（下载依赖）
cd "$CLI_DIR" && npm install --production

# 2. npm run build（tsc 编译）
npm run build

# 3. 在项目目录创建包装脚本 .forge/bin/forge
FORGE_BIN="$(pwd)/.forge/bin/forge"
mkdir -p "$(pwd)/.forge/bin"
cat > "$FORGE_BIN" << EOF
#!/bin/sh
node "$CLI_DIR/dist/index.js" "\$@"
EOF
chmod +x "$FORGE_BIN"
echo "✓ forge CLI installed: $FORGE_BIN"
```

### Skill 文件 CLI 调用约定

每个 skill 文件开头内置：

```bash
FORGE_CMD=$(command -v forge 2>/dev/null || echo ".forge/bin/forge")
```

---

## 三、CLI 命令全览

所有命令默认输出 JSON，`--human` 输出可读格式。

### Phase 1 核心命令

| 命令 | 职责 |
|------|------|
| `forge init [--auto-detect] [--superpowers-available true\|false]` | 项目探测与初始化，替代 skill 中的 Step 1-8 |
| `forge status` | 读取 Canonical State，输出系统现实 |
| `forge phase:advance` | planning → executing，校验前置条件 |
| `forge phase:complete` | executing → verification_complete |
| `forge phase:finish` | verification_complete → idle |
| `forge task:start --id N` | 标记任务开始 |
| `forge task:done --id N` | 标记完成，内部触发 Guard 计算 |
| `forge task:fail --id N --reason "..."` | 标记失败 |
| `forge task:defer --id N --reason "..."` | 标记延迟 |
| `forge test [--coverage] [--profile name] [--all-profiles]` | 执行测试，不做修复 |
| `forge verify [--coverage]` | 完整验收，结果写入 progress.json |
| `forge commit --message "..." --tag "forge task-N"` | git 提交 + audit trail |
| `forge commit:check --task-ids 1,2,3` | 验证 done 任务均有对应 commit |
| `forge guard:check` | 查询当前是否需要触发 Guard |
| `forge guard:record --type ... --status passed\|failed --tasks 1,2,3` | 记录 Guard 执行结果 |
| `forge memory:set-feature ...` | 更新 memory file Current Feature 区块 |
| `forge memory:complete-feature ...` | 移入 Completed Features，含回读验证 |
| `forge audit [--feature ...]` | 从 git history + progress.json 重建时间线 |
| `forge schema:validate --file ...` | 校验任意 .forge/ 文件 |
| `forge reset [--backup]` | 强制重置到 idle，提供系统出口 |

### Phase 2 新增命令

| 命令 | 职责 |
|------|------|
| `forge guard:preview --next-task-id N --next-task-title "..."` | 预告下一任务会触发哪些 Guard |
| `forge guard:run --type security-scan --task-id N` | 手动触发特定 Guard（调试用） |
| `forge guard:history` | 列出完整 Guard 历史 |
| `forge guard:coverage-check` | 执行覆盖率 Guard |
| `forge guard:security-scan --files src/auth.ts` | 执行安全扫描（semgrep → npm audit → 基础 pattern） |
| `forge guard:dependency-audit --new-packages lodash,zod` | 执行依赖审计 |
| `forge test:gstack [--type e2e\|visual\|performance]` | 运行 gstack 测试套件（需 gstack_installed: true） |
| `forge scenarios:export --feature ... --template ...` | 导出 scenarios 为模板 |
| `forge scenarios:import --template ... [--as-given]` | 引用 scenarios 模板 |
| `forge doctor` | 诊断运行环境完整性 |
| `forge migrate [--check] [--from 1.0 --to 1.1]` | 执行 schema 版本迁移 |
| `forge init --auto-detect --monorepo` | Monorepo 探测，生成 test_profiles |

---

## 四、Skill 文件改造

### 改造原则

改造后每个 skill 文件只做三件事：
1. 调用 `forge` CLI 命令
2. 解读 JSON 输出
3. 决定下一步（或向用户汇报）

### 主要删除的逻辑

| 原 skill 逻辑 | 替代方案 |
|---|---|
| start/SKILL.md Step 1-8（环境探测、config 写入、memory 初始化） | `forge init --auto-detect` |
| progress-tracking/SKILL.md 测试执行 | `forge test --coverage` |
| progress-tracking/SKILL.md git commit | `forge commit --message ... --tag ...` |
| progress-tracking/SKILL.md Guard 触发计算 | `forge task:done` 内部计算，返回 `guard_triggered` |
| progress-tracking/SKILL.md progress.json 更新 | `forge task:done` 内部写入 |
| done/SKILL.md memory file 写入 + 回读验证 | `forge memory:complete-feature`（CLI 内置回读验证） |
| resume/SKILL.md git log 一致性检查 | `forge audit` + `forge commit:check` |
| next/SKILL.md Scenario C 测试执行 + 构建 + 覆盖率 | `forge verify --coverage` |

### 保留在 skill 侧的逻辑

| 逻辑 | 原因 |
|---|---|
| 测试失败后的修复循环（最多 3 轮） | Workflow 纪律，重试次数是编排决策 |
| Guard 失败后的人工干预等待 | 需要与用户对话 |
| Superpowers skill 调用（brainstorming、writing-plans 等） | Reasoning，属于 AI 层 |
| CLI 输出解读与用户汇报 | Reasoning + Adaptation |

---

## 五、配置文件变更

### config.json（v2）

`test_command` 和 `test_framework` 字段**完全废弃**，替换为 `test_profiles`。
`version` 字段从 `"1.0"` 升至 `"2.0"` 以标识不兼容变更。

```json
{
  "version": "2.0",
  "forge_cli_version": "0.2.0",
  "memory_file": "CLAUDE.md",
  "test_mode": "normal",
  "gstack_installed": false,
  "project_type": "existing",
  "test_profiles": {
    "default": {
      "framework": "vitest",
      "command": "npx vitest run",
      "coverage_command": "npx vitest run --coverage",
      "working_dir": "."
    }
  },
  "test_coverage": { "unit": 80, "integration": 60, "e2e": "P0" },
  "guards": {
    "batch-review": {
      "enabled": true,
      "every_n_tasks": 6,
      "actions": ["spec-compliance-review"]
    },
    "coverage-gate": {
      "enabled": false,
      "trigger": "phase-complete",
      "actions": ["coverage-check"]
    },
    "security-scan": {
      "enabled": false,
      "trigger": "keyword",
      "keywords": ["auth", "crypto", "password", "token", "permission", "jwt", "oauth"],
      "severity_threshold": "HIGH",
      "actions": ["security-audit"]
    },
    "dependency-audit": {
      "enabled": false,
      "trigger": "new-dependency",
      "actions": ["dependency-check"],
      "license_allowlist": ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"]
    },
    "performance-budget": {
      "enabled": false,
      "trigger": "keyword",
      "keywords": ["component", "page", "ui", "frontend"],
      "budgets": { "bundle_size_kb": 500, "lcp_ms": 2500 },
      "actions": ["bundle-size-check"]
    },
    "human-review": {
      "enabled": false,
      "trigger": "manual",
      "actions": ["pause-for-human"]
    }
  }
}
```

### progress.json

结构不变，schema 版本保持 `"1.0"`。

---

## 六、Guard 系统

### Guard 执行顺序（多个同时触发时）

```
security-scan → dependency-audit → batch-review → performance-budget → human-review
```

fail-fast：任意一个失败，后续不再执行。

### Guard 触发逻辑（在 CLI `forge task:done` 内部）

```
1. 读取 config.json guards 配置
2. 对每个 enabled guard，评估触发条件：
   - batch-review：completed_tasks % every_n_tasks == 0
   - security-scan：task title 包含 keywords 中的词
   - dependency-audit：git diff 检测到 package.json/go.mod/Cargo.toml 变化
   - performance-budget：task title 包含 keywords 中的词
   - coverage-gate：由 forge phase:complete 触发，不在 task:done 中
   - human-review：task 标注 requires_human_review: true
3. 返回 guard_triggered: true/false 及触发的 guard 列表
```

---

## 七、Phase 2 扩展

### gstack 集成

gstack 作为可选 Guard action，仅在 `config.json.gstack_installed: true` 时可用。首轮实现只要求 `forge test:gstack` 在未安装或未启用时输出结构化 JSON 和友好提示；真正的浏览器测试、视觉回归和性能测试执行器留到后续迭代。

### Monorepo 支持

首轮实现 `test_profiles` 数据结构和 `forge test --profile/--all-profiles`。`forge init --auto-detect --monorepo` 可以生成基础 profile，但深度 ≤ 2 的完整 monorepo 探测和跨项目 scenarios 复用留到后续迭代。

### forge doctor

```
✓ forge CLI v0.2.0
✓ Node.js v20+
✓ .forge/config.json (valid schema)
✓ .forge/progress.json (valid schema)
✓ Test profiles: default (vitest)
✓ Git: initialized
⚠ GitNexus: not found (optional)
· gstack: not installed (optional)
✓ Superpowers: available
```

### forge migrate

迁移脚本存放于 `cli/src/migrations/`，每个版本一个文件。每次执行 `forge status` 或 `forge init` 时轻量检查是否需要迁移，发现版本不匹配时提示用户手动运行 `forge migrate`。

---

## 八、版本与兼容性

- plugin.json: `0.1.0 → 0.2.0`
- config.json: `version "1.0" → "2.0"`（因废弃 test_command/test_framework，不兼容变更）
- `config.json` 的 `test_command` / `test_framework` 字段完全废弃，v2 Runtime 不直接接受旧结构
- `forge migrate --from 1.0 --to 2.0` 负责把旧配置转换为 `test_profiles.default`
- `forge status` 和 `forge init` 发现旧配置时提示用户运行 migrate，不静默迁移

---

*forge v2 cli runtime design · 2026-05-25*
