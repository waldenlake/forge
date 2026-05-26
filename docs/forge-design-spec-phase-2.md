# Forge 设计文档 · Phase 2

> 相关文档：
> · [core.md](./core.md) — 核心哲学（WHY）
> · [forge-design-spec-phase-1-v2.md](./forge-design-spec-phase-1-v2.md) — 一期设计（WHAT）
> · [forge-cli-design-v2.md](./forge-cli-design-v2.md) — CLI 技术设计（HOW）

---

## 二期目标

Phase 1 建立了 forge 的核心骨架：状态管理、phase transition、基础 Guard、CLI Runtime。
二期在此基础上扩展三个方向：

```
1. Guard 系统扩展     → 更多质量门禁，覆盖安全、性能、覆盖率
2. gstack 集成        → 浏览器测试、视觉 QA、性能测试
3. 多项目支持         → Monorepo、多测试框架共存、跨项目 scenarios 复用
```

**二期不改变核心哲学**，所有扩展都在 core.md 的三层结构内进行。

---

## 一、Guard 系统扩展

### 1.1 新增 Guard 类型

在 Phase 1 的 `batch-review` 基础上，增加以下 Guard：

#### `coverage-gate`

**触发条件**：所有 task 完成后（`forge phase:complete` 之前）

**检查逻辑**（CLI 执行）：
```bash
forge guard:coverage-check \
  --unit-target 80 \
  --integration-target 60 \
  --e2e-priority P0
```

```jsonc
// 通过
{
  "ok": true,
  "coverage": {
    "unit":        { "value": 84.2, "target": 80, "ok": true },
    "integration": { "value": 67.0, "target": 60, "ok": true },
    "e2e_p0":      { "all_passing": true }
  }
}

// 未达标
{
  "ok": false,
  "coverage": {
    "unit": { "value": 71.3, "target": 80, "ok": false, "gap": 8.7 }
  },
  "failing_scenarios": ["S003", "S007"]  // 未被测试覆盖的 P0 场景
}
```

失败时：列出未覆盖的 scenarios，AI 决定补测试还是标记 deferred。

#### `security-scan`

**触发条件**：task 的 `title` 或 `tags` 包含 `auth`、`crypto`、`password`、`token`、`permission` 关键词时，`forge task:done` 自动标记，Guard 在该 task 后触发。

**配置**：
```json
"guards": {
  "security-scan": {
    "enabled": true,
    "trigger": "keyword",
    "keywords": ["auth", "crypto", "password", "token", "permission", "jwt", "oauth"],
    "actions": ["security-audit"]
  }
}
```

**检查动作**：`security-audit`
- CLI 调用：`forge guard:security-scan --files <changed-files>`
- 扫描：hardcoded secrets、SQL injection 风险、XSS 风险、不安全的随机数
- 工具优先级：`semgrep` → `npm audit` / `cargo audit` → 基础 pattern 扫描

```jsonc
{
  "ok": false,
  "findings": [
    {
      "severity": "HIGH",
      "type": "hardcoded-secret",
      "file": "src/auth/jwt.ts",
      "line": 12,
      "message": "Potential hardcoded JWT secret"
    }
  ]
}
```

失败时：blocking，列出所有 HIGH/CRITICAL findings，等人修复。
WARNING 级别：记录到 guard_history 但不 blocking。

#### `dependency-audit`

**触发条件**：检测到新的 `import` 或 `require` 引入了此前不存在的包时触发。
CLI 通过对比 `git diff` 中的 package.json / go.mod / Cargo.toml 变更来判断。

**检查动作**：
```bash
forge guard:dependency-audit --new-packages lodash,zod
```

- 检查 license 兼容性（MIT/Apache/BSD 允许，GPL 警告）
- 检查 CVE（`npm audit` / `cargo audit` / `pip-audit`）
- 检查包的周下载量（< 1000 时警告）

```jsonc
{
  "ok": true,
  "packages": [
    {
      "name": "lodash",
      "license": "MIT",
      "license_ok": true,
      "vulnerabilities": 0,
      "weekly_downloads": 45000000
    }
  ]
}
```

#### `performance-budget`

**触发条件**：task 包含 UI 相关关键词（`component`、`page`、`ui`、`frontend`）。

**配置**：
```json
"guards": {
  "performance-budget": {
    "enabled": false,
    "trigger": "keyword",
    "keywords": ["component", "page", "ui", "frontend", "render"],
    "budgets": {
      "bundle_size_kb": 500,
      "lcp_ms": 2500,
      "fid_ms": 100
    },
    "actions": ["bundle-size-check"]
  }
}
```

**默认关闭**，需要用户在 config.json 手动开启并配置阈值。

#### `human-review`

**触发条件**：用户在 config.json 中指定，或在 task 列表中手动标注 `"requires_human_review": true`。

**行为**：完全 blocking，输出：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚒ Human Review Required
  Task <id>: <title>
  Reason: <config 中的 reason 字段>

  Review the changes, then run /next to continue.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 1.2 Guard 配置全量示例

```json
{
  "guards": {
    "batch-review": {
      "enabled": true,
      "every_n_tasks": 6,
      "actions": ["spec-compliance-review", "session-handoff-suggestion"]
    },
    "coverage-gate": {
      "enabled": true,
      "trigger": "phase-complete",
      "actions": ["coverage-check"]
    },
    "security-scan": {
      "enabled": true,
      "trigger": "keyword",
      "keywords": ["auth", "crypto", "password", "token", "permission", "jwt", "oauth"],
      "severity_threshold": "HIGH",
      "actions": ["security-audit"]
    },
    "dependency-audit": {
      "enabled": true,
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

### 1.3 Guard 执行顺序

多个 Guard 在同一 task 触发时，按以下顺序执行：

```
security-scan → dependency-audit → batch-review → performance-budget → human-review
```

任意一个失败即 blocking，后续 Guard 不再执行（fail-fast）。

### 1.4 `forge guard:*` 新增命令

```bash
# 查询哪些 guard 会在下一个 task 触发
forge guard:preview --next-task-id 7 --next-task-title "Add OAuth login"

# 运行特定 guard（手动触发，调试用）
forge guard:run --type security-scan --task-id 7

# 列出所有 guard 历史
forge guard:history
```

---

## 二、gstack 集成

### 2.1 gstack 是什么

gstack 是增强测试工具，提供 forge-cli 原生测试能力之外的补充：
- 浏览器端到端测试（Playwright/Puppeteer）
- 视觉回归测试（截图对比）
- 性能测试（Core Web Vitals）
- 移动端适配测试

### 2.2 集成方式

gstack 作为可选 Guard action，在 `config.json` 中配置：

```json
{
  "gstack_installed": true,
  "guards": {
    "batch-review": {
      "enabled": true,
      "every_n_tasks": 6,
      "actions": ["spec-compliance-review", "gstack-e2e", "gstack-visual"]
    }
  }
}
```

**新增 CLI 命令**：

```bash
# 运行 gstack 测试套件
forge test:gstack [--type e2e|visual|performance] [--coverage]

# 输出
{
  "ok": true,
  "type": "e2e",
  "passed": 18,
  "failed": 0,
  "screenshots": ".forge/gstack/screenshots/",
  "duration_ms": 12400
}
```

### 2.3 gstack 测试在工作流中的位置

```
forge task:done（batch-review 触发）
  → spec-compliance-review（Superpowers）
  → forge test:gstack --type e2e（gstack）
  → forge test:gstack --type visual（gstack）
  → forge guard:record --status passed|failed
```

gstack 失败时：输出截图路径，列出失败的视觉对比，AI 分析后决定修复或豁免。

### 2.4 视觉回归基准管理

```bash
# 建立视觉基准（feature 开始时运行一次）
forge test:gstack --type visual --update-baseline

# 对比当前状态与基准
forge test:gstack --type visual --compare

# 输出
{
  "ok": false,
  "regressions": [
    {
      "component": "LoginButton",
      "diff_percent": 3.2,
      "baseline": ".forge/gstack/baselines/login-button.png",
      "current":  ".forge/gstack/screenshots/login-button.png",
      "diff":     ".forge/gstack/diffs/login-button-diff.png"
    }
  ]
}
```

---

## 三、多项目支持

### 3.1 问题

Phase 1 的 `forge init --auto-detect` 在 monorepo 场景下有局限：
- 根目录可能有多个 `package.json`
- 不同子项目使用不同测试框架（Java 后端 + TypeScript 前端）
- 一个 feature 可能跨越多个子项目

### 3.2 多测试框架配置

**config.json 扩展**：

```json
{
  "test_profiles": {
    "default": {
      "framework": "vitest",
      "command": "npx vitest run",
      "coverage_command": "npx vitest run --coverage",
      "working_dir": "frontend/"
    },
    "backend": {
      "framework": "junit",
      "command": "mvn test",
      "coverage_command": "mvn test jacoco:report",
      "working_dir": "backend/"
    },
    "e2e": {
      "framework": "playwright",
      "command": "npx playwright test",
      "working_dir": "."
    }
  },
  "test_command": null,       // 废弃，由 test_profiles 替代
  "test_framework": null      // 废弃，由 test_profiles 替代
}
```

**新增 CLI 参数**：

```bash
# 运行指定 profile 的测试
forge test --profile backend
forge test --profile default --coverage

# 运行所有 profile
forge test --all-profiles
```

### 3.3 `forge init` 的 Monorepo 探测

```bash
forge init --auto-detect --monorepo
```

**探测逻辑**：

1. 检测根目录是否有 `pnpm-workspace.yaml` / `lerna.json` / `nx.json` / `turbo.json` → monorepo
2. 遍历子目录（深度 ≤ 2），为每个含有测试框架标志的子目录创建一个 profile
3. 生成 `test_profiles` 结构，供用户确认

```jsonc
// forge init --auto-detect --monorepo 输出
{
  "ok": true,
  "monorepo": true,
  "detected_profiles": [
    { "name": "frontend", "framework": "vitest",  "working_dir": "frontend/" },
    { "name": "backend",  "framework": "junit",   "working_dir": "backend/" },
    { "name": "e2e",      "framework": "playwright","working_dir": "e2e/" }
  ],
  "suggestion": "Review test_profiles in .forge/config.json before running /start"
}
```

### 3.4 跨项目 Scenarios 复用

二期引入 **scenarios 模板**，允许在多个 feature 之间复用通用场景（如认证检查）。

```bash
# 将某 feature 的 scenarios 导出为模板
forge scenarios:export --feature user-authentication --template auth-scenarios

# 在新 feature 中引用模板（scenarios skill 自动合并）
forge scenarios:import --template auth-scenarios --as-given
```

`.forge/templates/` 目录存放导出的模板：

```json
// .forge/templates/auth-scenarios.json
{
  "version": "1.0",
  "template": "auth-scenarios",
  "description": "Standard authentication preconditions",
  "scenarios": [
    {
      "id": "T001",
      "type": "given-template",
      "title": "User is authenticated",
      "given": "a user with valid JWT token"
    }
  ]
}
```

---

## 四、CLI 稳定性与可观测性

### 4.1 结构化日志

所有 CLI 命令支持 `--log-file` 参数，将执行日志写入文件：

```bash
forge test --coverage --log-file .forge/logs/test-2026-05-25.jsonl
```

日志格式（JSON Lines）：
```jsonl
{"ts":"2026-05-25T10:30:00Z","cmd":"test","event":"start","profile":"default"}
{"ts":"2026-05-25T10:30:04Z","cmd":"test","event":"result","ok":true,"passed":142}
```

### 4.2 `forge doctor`

新增诊断命令，检查 forge 运行环境的完整性：

```bash
forge doctor
```

```
▸ forge doctor
    ✓ forge CLI v0.2.0
    ✓ Node.js v20.11.0
    ✓ .forge/config.json (valid schema)
    ✓ .forge/progress.json (valid schema)
    ✓ Test command: npx vitest run (executable)
    ✓ Git: initialized, clean working tree
    ⚠ GitNexus: not found (optional)
    · gstack: not installed (optional, Phase 2)
    ✓ Superpowers: available
```

### 4.3 `forge migrate`

处理版本升级时的 schema 迁移：

```bash
# 检查当前文件是否需要迁移
forge migrate --check

# 执行迁移（自动备份）
forge migrate --from 1.0 --to 1.1
```

迁移脚本存放在 `cli/src/migrations/` 目录下，每个版本对应一个文件。

### 4.4 `forge status` 增强

二期 `forge status` 增加 Guard 预告信息：

```jsonc
{
  "status": "executing",
  "feature": "user-auth-jwt",
  "progress": { "completed": 4, "total": 9 },
  "next_task": { "id": 5, "title": "Add refresh token endpoint" },
  "guard": {
    "due_at_task": 6,
    "tasks_until_guard": 2,
    "next_guard_type": "batch-review",
    "preview": {
      "security_scan_will_trigger": true,   // task 5 含 token 关键词
      "reason": "task title contains 'token'"
    }
  }
}
```

---

## 五、二期 CLI 命令汇总（新增）

| 命令 | 说明 |
|------|------|
| `forge guard:preview` | 预告下一个 task 会触发哪些 Guard |
| `forge guard:run` | 手动触发特定 Guard（调试用） |
| `forge guard:history` | 列出完整 Guard 历史 |
| `forge guard:coverage-check` | 执行覆盖率 Guard |
| `forge guard:security-scan` | 执行安全扫描 Guard |
| `forge guard:dependency-audit` | 执行依赖审计 Guard |
| `forge test:gstack` | 运行 gstack 测试套件 |
| `forge test --profile <name>` | 运行指定测试 profile |
| `forge test --all-profiles` | 运行所有测试 profile |
| `forge scenarios:export` | 导出 scenarios 为模板 |
| `forge scenarios:import` | 引用 scenarios 模板 |
| `forge doctor` | 诊断运行环境 |
| `forge migrate` | 执行 schema 版本迁移 |

---

## 六、二期发布计划

### 里程碑划分

```
Phase 2.0 — Guard 扩展（4 周）
  · coverage-gate
  · security-scan（semgrep 集成）
  · dependency-audit
  · forge guard:preview / guard:run / guard:history

Phase 2.1 — gstack 集成（3 周）
  · forge test:gstack
  · 视觉回归基准管理
  · Guard action: gstack-e2e / gstack-visual

Phase 2.2 — 多项目支持（3 周）
  · test_profiles
  · forge init --monorepo
  · scenarios 模板系统

Phase 2.3 — 稳定性与可观测性（2 周）
  · 结构化日志
  · forge doctor
  · forge migrate
  · forge status 增强
```

### 向后兼容承诺

- Phase 1 的 `.forge/config.json` 和 `.forge/progress.json` 在 Phase 2 全程有效
- `forge migrate --check` 在每次 CLI 启动时自动运行，发现需要迁移时提示用户
- Phase 1 skill 文件无需修改即可使用 Phase 2 的新 Guard 类型
  （新 Guard 通过 config.json 配置启用，不影响现有 skill 逻辑）

---

## 七、不在二期范围内的内容

以下内容明确推迟到 Phase 3 或更远：

| 内容 | 原因 |
|------|------|
| forge 云端状态同步 | 需要身份验证体系，超出当前架构范围 |
| 多人协作（同一 feature 多个 AI 实例并行） | 并发状态管理复杂度高 |
| 自然语言 Guard 配置（"在涉及支付的任务后审查"） | 需要 NLP 分类，Phase 3 考虑 |
| forge UI dashboard | 非核心路径，CLI-first 优先 |
| 自动生成 scenarios（无需 Superpowers brainstorming） | 质量不可控，违背"测试来自人类确认的需求"原则 |
