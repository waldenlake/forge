# Forge v2 Round 2 — Guard 扫描器 + gstack + 多项目 + 模板 + 可观测性

> 日期：2026-05-26
> 分支：feature/v2-cli-runtime
> 状态：已确认，待实现
> 前置：Round 1 已完成所有 CLI Runtime 核心闭环（168 tests passing）

---

## 背景

Round 1 建立了 Forge CLI Runtime 的完整骨架：
- 状态管理、schema 校验、phase transition、task/guard 触发计算
- 测试执行、验收、git 提交、audit、reset、memory 管理
- Phase 2 命令的 stub 接口（返回 `unsupported: true`）

Round 2 的目标是**让所有 stub 变成真正可工作的实现**，按 Phase 2 设计文档的优先级：

```
Phase 2.0 — Guard 扫描器实现
Phase 2.1 — gstack 完整实现
Phase 2.2 — Monorepo 探测 + Scenarios 模板
Phase 2.3 — 结构化日志 + forge status 增强
```

---

## 一、Guard 扫描器实现

### 1.1 security-scan（基础 pattern 扫描）

**新增文件**：`cli/src/lib/scanners/security.ts`

**设计**：

接收文件路径列表，逐行扫描预定义正则规则，输出 findings。

```ts
export type SecurityFinding = {
  severity: 'HIGH' | 'CRITICAL' | 'WARNING';
  type: string;
  file: string;
  line: number;
  message: string;
  match: string;  // 匹配到的文本片段（脱敏）
};

export type SecurityScanResult = {
  ok: boolean;
  findings: SecurityFinding[];
  scanned_files: number;
  scanner: 'pattern' | 'semgrep';
};
```

**扫描规则**（内置，不需要外部配置文件）：

| 规则 ID | 类型 | Severity | Pattern 描述 |
|---------|------|----------|-------------|
| `hardcoded-secret` | hardcoded-secret | HIGH | `password\s*[:=]\s*['"][^'"]+['"]`（非空值） |
| `aws-key` | hardcoded-secret | CRITICAL | `AKIA[0-9A-Z]{16}` |
| `private-key` | hardcoded-secret | CRITICAL | `-----BEGIN (RSA|EC|DSA) PRIVATE KEY-----` |
| `jwt-secret` | hardcoded-secret | HIGH | `(jwt|JWT).*secret\s*[:=]\s*['"][^'"]+['"]` |
| `generic-api-key` | hardcoded-secret | HIGH | `(api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{8,}['"]` |
| `sql-concat` | sql-injection | WARNING | 字符串拼接 SQL 关键词（`"SELECT.*" \+ ` 等） |
| `eval-usage` | code-injection | WARNING | `eval\(` / `new Function\(` |
| `insecure-random` | weak-crypto | WARNING | `Math\.random\(\)` 在 auth/crypto 上下文 |

**semgrep 降级逻辑**：
1. 检查 `semgrep` 是否在 PATH（使用 `detectOptionalTool('semgrep')`）
2. 如果可用：`semgrep scan --config auto --json --target <files>` → 解析输出
3. 如果不可用：使用内置 pattern 扫描器
4. 输出中标注 `scanner: 'pattern' | 'semgrep'`

**文件列表来源**：
- `--files <paths>` 参数显式传入
- 若未传入，使用 `git diff --name-only HEAD~1` 获取最近变更文件

**severity 过滤**：
- 读取 `config.guards['security-scan'].severity_threshold`
- 只有 >= threshold 的 findings 才算 blocking
- WARNING 级 findings 记录但不 blocking

**命令改造**：
- `guard:run --type security-scan --task-id N` → 不再返回 `unsupported`，执行真正扫描
- 新增 `guard:security-scan --files <paths>` 命令（直接运行扫描器）

---

### 1.2 dependency-audit（npm audit 封装）

**新增文件**：`cli/src/lib/scanners/dependency.ts`

**设计**：

```ts
export type PackageAuditResult = {
  name: string;
  version?: string;
  license: string | null;
  license_ok: boolean;
  vulnerabilities: number;
  highest_severity?: string;
};

export type DependencyAuditResult = {
  ok: boolean;
  packages: PackageAuditResult[];
  new_packages_detected: string[];
  scanner: 'npm-audit' | 'cargo-audit' | 'pip-audit' | 'manual';
};
```

**工作流程**：

1. **检测新增包**：
   - 使用已有 `changedDependencyFiles(cwd)` 检测依赖文件变更
   - 如果有 `package.json` 变更，解析 git diff 提取新增的 dependency 名称
   - `--new-packages <names>` 参数也可以显式传入

2. **漏洞检查**：
   - Node 项目：`npm audit --json` → 解析 `vulnerabilities` 对象
   - Rust 项目：`cargo audit --json`（如果 cargo-audit 可用）
   - Python 项目：`pip-audit --format json`（如果 pip-audit 可用）
   - 如果工具不可用，输出 `scanner: 'manual'` 提示用户手动检查

3. **License 检查**：
   - 对每个新增包，读取 `node_modules/<pkg>/package.json` 的 `license` 字段
   - 与 `config.guards['dependency-audit'].license_allowlist` 对比
   - 不在 allowlist 中的 license → `license_ok: false`

4. **结果判定**：
   - 任何包有 `vulnerabilities > 0`（HIGH/CRITICAL） → `ok: false`
   - 任何包 `license_ok: false` → `ok: false`

**命令改造**：
- `guard:run --type dependency-audit --task-id N` → 执行真正审计
- `guard:dependency-audit --new-packages <names>` → 直接运行审计

---

### 1.3 coverage-gate（Istanbul JSON 解析）

**新增文件**：`cli/src/lib/scanners/coverage.ts`

**设计**：

```ts
export type CoverageMetric = {
  value: number;
  target: number;
  ok: boolean;
  gap?: number;  // 仅当 ok=false 时
};

export type CoverageCheckResult = {
  ok: boolean;
  coverage: {
    unit?: CoverageMetric;
    integration?: CoverageMetric;
    e2e_p0?: { all_passing: boolean };
  };
  report_path: string | null;
  format: 'istanbul' | 'unknown';
};
```

**工作流程**：

1. **定位覆盖率报告**：
   - 搜索 `coverage/coverage-summary.json`（Istanbul 标准路径）
   - 如果不存在，搜索 `coverage/lcov.info`
   - 优先使用 Istanbul JSON 格式

2. **解析 Istanbul JSON**：
   ```json
   {
     "total": {
       "lines": { "total": 1000, "covered": 850, "pct": 85.0 },
       "branches": { "total": 200, "covered": 160, "pct": 80.0 }
     }
   }
   ```
   - 取 `total.lines.pct` 作为 unit coverage 值

3. **与配置阈值比较**：
   - 读取 `config.test_coverage.unit`（默认 80）
   - 读取 `config.test_coverage.integration`（默认 60）
   - 计算 gap = target - value

4. **参数支持**：
   - `--unit-target N` 覆盖 config 中的值
   - `--integration-target N` 覆盖 config 中的值
   - `--report-path <path>` 指定报告文件路径

**命令改造**：
- `guard:coverage-check` → 不再返回 `unsupported`，执行真正检查

---

### 1.4 guard:run 统一调度

`guard:run --type <type> --task-id N` 改造为真正的调度器：

```ts
switch (type) {
  case 'security-scan':
    // 获取 task 相关文件，调用 security scanner
    break;
  case 'dependency-audit':
    // 检测新增依赖，调用 dependency scanner
    break;
  case 'coverage-gate':
    // 运行 coverage-check
    break;
  case 'batch-review':
  case 'performance-budget':
  case 'human-review':
    // 这些由 skill 侧处理（batch-review 调用 Superpowers）
    writeJson({ ok: true, delegated: true, type, message: `${type} is handled by skill layer` });
    break;
}
```

---

## 二、gstack 完整实现

### 2.1 架构

```
cli/src/lib/gstack/
├── runner.ts        ← 统一入口，type 路由
├── e2e.ts           ← Playwright 测试执行
├── visual.ts        ← 截图对比（pixelmatch）
└── performance.ts   ← Core Web Vitals 采集
```

### 2.2 前置条件

- `config.gstack_installed: true`
- Playwright 安装验证：`npx playwright --version` 返回 0

### 2.3 e2e 测试

```ts
export type GstackE2eResult = {
  ok: boolean;
  type: 'e2e';
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  report_path: string;
};
```

**实现**：
- 运行 `npx playwright test --reporter=json`
- 解析 Playwright JSON 报告（`test-results/report.json`）
- 提取 passed/failed/skipped 计数
- 支持 `--config <path>` 指定 Playwright 配置文件路径

### 2.4 视觉回归

```ts
export type VisualRegression = {
  component: string;
  diff_percent: number;
  baseline: string;
  current: string;
  diff: string;
};

export type GstackVisualResult = {
  ok: boolean;
  type: 'visual';
  regressions: VisualRegression[];
  threshold: number;  // diff_percent 阈值，默认 1.0
  screenshots_dir: string;
};
```

**实现**：
- 基准路径：`.forge/gstack/baselines/`
- 当前截图：`.forge/gstack/screenshots/`
- Diff 输出：`.forge/gstack/diffs/`
- 截图方式：使用 Playwright `page.screenshot()` 对配置中指定的 URL/组件截图
- 对比方式：`pixelmatch` 库逐像素对比
- `--update-baseline` 将当前截图复制为新基准
- `--compare` 执行对比
- `--threshold <pct>` 覆盖默认 1.0% 差异阈值

**gstack 视觉配置**（`config.json` 扩展或独立 `.forge/gstack/config.json`）：
```json
{
  "visual": {
    "pages": [
      { "name": "login", "url": "http://localhost:3000/login", "viewport": { "width": 1280, "height": 720 } },
      { "name": "dashboard", "url": "http://localhost:3000/dashboard" }
    ],
    "threshold": 1.0
  }
}
```

### 2.5 性能测试

```ts
export type WebVitals = {
  lcp_ms: number;
  fid_ms: number;
  cls: number;
  ttfb_ms: number;
};

export type GstackPerformanceResult = {
  ok: boolean;
  type: 'performance';
  metrics: WebVitals;
  budgets: Record<string, number>;  // 从 config 读取
  violations: string[];  // 超出 budget 的指标名
};
```

**实现**：
- 使用 Playwright 打开目标 URL
- 通过 `page.evaluate()` 注入 Web Vitals 采集脚本（`web-vitals` 库的内联版本）
- 或使用 `PerformanceObserver` API 直接采集 LCP/FID/CLS
- 与 `config.guards['performance-budget'].budgets` 比较
- 超出 budget 的指标列入 `violations`

### 2.6 新增依赖

```json
{
  "dependencies": {
    "pixelmatch": "^6.0.0",
    "pngjs": "^7.0.0"
  },
  "devDependencies": {
    "@types/pngjs": "^7.0.0"
  }
}
```

Playwright 不作为 forge-cli 依赖，而是运行时检测其可用性。

---

## 三、Monorepo 深度探测

### 3.1 增强 detect.ts

新增函数 `detectMonorepoProfiles(cwd: string): MonorepoDetectResult`：

```ts
export type MonorepoDetectResult = {
  monorepo: boolean;
  monorepo_type: 'pnpm' | 'lerna' | 'nx' | 'turbo' | 'yarn' | null;
  detected_profiles: Array<{
    name: string;
    framework: string;
    working_dir: string;
    command: string;
    coverage_command?: string;
  }>;
};
```

**探测逻辑**：

1. **识别 monorepo 类型**：
   - `pnpm-workspace.yaml` → pnpm
   - `lerna.json` → lerna
   - `nx.json` → nx
   - `turbo.json` → turbo
   - `workspaces` in `package.json` → yarn/npm workspaces

2. **解析 workspace 目录列表**：
   - pnpm：解析 `pnpm-workspace.yaml` 的 `packages` 字段（glob 展开）
   - yarn/npm：解析 `package.json.workspaces`
   - lerna：解析 `lerna.json.packages`
   - nx/turbo：遍历子目录（深度 ≤ 2）

3. **对每个子目录**：
   - 运行已有的 `detectTestProfiles()` 逻辑
   - 生成 profile 名称 = 子目录名
   - 跳过无测试框架的子目录

### 3.2 init --monorepo 改造

`forge init --auto-detect --monorepo`：
- 调用 `detectMonorepoProfiles(cwd)`
- 将多个 profiles 写入 config.json
- 输出探测结果供用户确认

---

## 四、Scenarios 模板系统

### 4.1 scenarios:export

**改造 `cli/src/commands/scenarios.ts`**：

```
forge scenarios:export --feature <slug> --template <name>
```

1. 读取 `.forge/scenarios.json`
2. 包装为模板格式：
   ```json
   {
     "version": "1.0",
     "template": "<name>",
     "description": "Exported from feature: <slug>",
     "exported_at": "<ISO timestamp>",
     "scenarios": [...]
   }
   ```
3. 写入 `.forge/templates/<name>.json`
4. 输出 `{ ok: true, template: "<name>", path: ".forge/templates/<name>.json", scenarios_count: N }`

### 4.2 scenarios:import

```
forge scenarios:import --template <name> [--as-given]
```

1. 读取 `.forge/templates/<name>.json`
2. 读取当前 `.forge/scenarios.json`（如不存在则创建空结构）
3. 合并：
   - `--as-given`：将模板中的 scenarios 标记为 `type: "given-template"`，用作前置条件
   - 无 flag：直接追加到 scenarios 数组
4. ID 去重：跳过已存在的同 ID scenarios
5. 写入 `.forge/scenarios.json`
6. 输出 `{ ok: true, imported: N, skipped_duplicates: M, template: "<name>" }`

---

## 五、可观测性

### 5.1 结构化日志

**新增文件**：`cli/src/lib/logger.ts`

```ts
export type LogEntry = {
  ts: string;
  cmd: string;
  event: 'start' | 'result' | 'error';
  [key: string]: unknown;
};

export class ForgeLogger {
  constructor(private logFile: string | null) {}
  log(entry: Omit<LogEntry, 'ts'>): void;
}
```

**全局 `--log-file` 参数**：
- 在 `program` 级别注册 `--log-file <path>` 选项
- 通过 `program.hook('preAction')` 初始化 logger
- 每个命令的 action 开始和结束时写入 log entry
- JSONL 格式追加写入

### 5.2 forge status 增强

当 `status === 'executing'` 时，输出增加 `guard` 字段：

```json
{
  "guard": {
    "due_at_task": 6,
    "tasks_until_guard": 2,
    "next_guard_type": "batch-review",
    "preview": {
      "security_scan_will_trigger": true,
      "reason": "next task title contains 'token'"
    }
  }
}
```

**计算逻辑**：
- 找到下一个 pending task
- 对该 task 调用 `triggeredGuards()` 做预计算
- 计算 batch-review 距离（`every_n_tasks - (completed % every_n_tasks)`）

---

## 六、文件结构变更

```
cli/src/lib/scanners/
├── security.ts        ← 新增：安全扫描规则引擎
├── dependency.ts      ← 新增：依赖审计封装
└── coverage.ts        ← 新增：覆盖率解析

cli/src/lib/gstack/
├── runner.ts          ← 新增：gstack 统一入口
├── e2e.ts             ← 新增：Playwright e2e 执行器
├── visual.ts          ← 新增：视觉回归对比
└── performance.ts     ← 新增：Core Web Vitals 采集

cli/src/lib/logger.ts  ← 新增：JSONL 结构化日志

cli/src/lib/detect.ts  ← 修改：增加 monorepo 探测
cli/src/commands/guard.ts     ← 修改：guard:run 调度器
cli/src/commands/gstack.ts    ← 修改：真正执行
cli/src/commands/scenarios.ts ← 修改：export/import 实现
cli/src/commands/status.ts    ← 修改：Guard 预告字段
cli/src/index.ts              ← 修改：注册 --log-file 全局参数
```

**新增依赖**（cli/package.json）：
- `pixelmatch: ^6.0.0`
- `pngjs: ^7.0.0`
- `yaml: ^2.4.0`（解析 pnpm-workspace.yaml）
- `@types/pngjs: ^7.0.0`（dev）

---

## 七、测试策略

每个模块对应一个测试文件：

| 测试文件 | 覆盖内容 |
|---------|---------|
| `cli/test/security-scan.test.ts` | pattern 扫描规则命中/未命中、severity 过滤、semgrep 降级 |
| `cli/test/dependency-audit.test.ts` | 新包检测、license 检查、npm audit 解析 |
| `cli/test/coverage-gate.test.ts` | Istanbul JSON 解析、阈值比较、缺失报告处理 |
| `cli/test/gstack-e2e.test.ts` | Playwright 报告解析、不可用时友好输出 |
| `cli/test/gstack-visual.test.ts` | pixelmatch 对比、基准管理、阈值判定 |
| `cli/test/gstack-performance.test.ts` | Web Vitals 解析、budget 对比 |
| `cli/test/monorepo-detect.test.ts` | 各种 workspace 格式探测 |
| `cli/test/scenarios-template.test.ts` | export/import/去重/as-given |
| `cli/test/logger.test.ts` | JSONL 写入、全局参数挂载 |
| `cli/test/status-enhanced.test.ts` | Guard 预告字段计算 |

测试使用 temp 目录和 fixture 文件，不依赖网络或外部工具。对于 gstack 测试，mock Playwright 输出。

---

## 八、不在本轮范围内

| 内容 | 原因 |
|------|------|
| semgrep 自定义规则编写 | 用户自行管理，forge 只调用 |
| npm registry API 查询周下载量 | 需要网络，最小版本不含 |
| lcov 格式解析 | Istanbul JSON 足够，后续迭代加 |
| gstack 移动端适配测试 | 需要额外设备/模拟器配置 |
| 跨项目 scenarios 复用（不同仓库间） | 需要文件系统外传输，推迟 |

---

*Forge v2 Round 2 design · 2026-05-26*
