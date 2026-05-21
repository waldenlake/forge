# Forge Phase 1 实现审查

## 总体评价

代码结构清晰，TypeScript 类型定义完善，核心概念基本正确。但**设计与实现之间存在一些根本性的偏差**，主要体现在 CLI 和 Skill 的职责边界上。

---

## 核心问题

### 问题1：CLI 承担了过多职责（违反设计原则）

**设计文档说**：
> 唯一需要的 CLI 操作是 `forge init`，之后所有交互通过 AI 里的 skill 命令完成

**实际实现**：
CLI 包含了大量本应在 Skill 里完成的功能：

```typescript
// index.ts 中的问题命令
forge resume          // 应该是 /resume skill
forge done            // 应该是 /done skill
forge bugfix          // 应该是 /bugfix skill
forge execute task    // 应该在 skill 里直接操作
forge execute batch   // 应该在 skill 里直接操作
forge execute progress // 应该在 skill 里直接操作
```

这些命令会导致：
- 用户不知道该用 CLI 命令还是 skill 命令
- Skill 必须依赖 CLI（例如 start.md 里调用 `forge execute progress init`）
- 违反了"纯 skill + 极轻量 CLI"的设计

**应该怎么做**：
- CLI 只保留 `forge init`、`forge config`、`forge status`、`forge validate`、`forge skills install`、`forge manifest`
- 删除 `forge resume`、`forge done`、`forge bugfix`、`forge execute`
- 所有执行逻辑由 Skill 直接完成，不依赖 CLI

---

### 问题2：Skill 调用 CLI 命令（循环依赖）

**在 start.md 中**：
```markdown
Run `forge execute progress init "<feature-slug>"` or write directly:
```

**在 next.md 中**：
```markdown
Run `forge execute batch cut` or perform manually:
...
Run `forge execute task run-tests` or the project's test command
```

**问题**：
- Skill 不应该调用 CLI 命令，应该直接操作文件或调用其他 skill
- 这造成了 Skill → CLI → Skill 的循环依赖
- 用户在 AI 对话里看到"运行 `forge execute ...`"会很困惑

**应该怎么做**：
Skill 应该直接写文件或调用子程序：
```markdown
# 不要这样
Run `forge execute progress init`

# 应该这样
Write .forge/progress.json:
{
  "version": "1.0",
  "feature": "<feature-slug>",
  ...
}
```

---

### 问题3：Skill 没有明确如何调用 Superpowers skill

**在 start.md 和 next.md 中多次出现**：
```markdown
Load the Superpowers `brainstorming` skill
Load the Superpowers `writing-plans` skill
```

**问题**：
- "Load" 是什么意思？AI 怎么执行这个指令？
- Superpowers 的 skill 应该如何被调用？是直接说"运行 brainstorming skill"还是别的方式？

**应该怎么做**：
明确调用语法，例如：
```markdown
运行 Superpowers brainstorming skill：
输入当前需求描述，通过 Socratic 对话澄清不清楚的地方，
生成 proposal.md
```

或者直接嵌入调用指令：
```markdown
/brainstorming <requirement>
```

---

### 问题4：Manifest 使用了硬编码的绝对路径

**在 manifest.ts 中**：
```typescript
const manifest = {
  skills: [
    { name: '/start', path: '~/.agents/skills/forge/start.md' },
    ...
  ],
};
```

**问题**：
- 硬编码路径 `~/.agents/skills/forge/` 假设用户把 skill 安装到这个位置
- 不同系统可能用不同路径（`~/.claude/skills/`、`~/.cursor/skills/` 等）
- 用户手动安装到其他位置时会找不到 skill

**应该怎么做**：
使用相对路径或环境变量：
```typescript
// 方案A：相对路径（假设 manifest 和 skill 在同一仓库）
{ name: '/start', path: '../forge-skill/start.md' }

// 方案B：环境变量
const skillsRoot = process.env.FORGE_SKILLS_PATH || '~/.claude/skills/forge';
{ name: '/start', path: `${skillsRoot}/start.md` }
```

或者在 `forge init` 时自动复制 skill 文件到项目本地：
```typescript
// 复制 skill 到 .forge/skills/
{ name: '/start', path: '.forge/skills/start.md' }
```

---

### 问题5：Manifest 缺少内部 skill

**当前 manifest 只包含**：
- start.md
- next.md
- resume.md
- done.md
- bugfix.md

**缺少**：
- scenarios.md
- progress-tracking.md
- session-handoff.md

**问题**：
虽然这三个是"内部" skill，但它们也需要被 AI 调用，所以应该在 manifest 里注册。

**应该怎么做**：
```typescript
skills: [
  { name: '/start', path: '...' },
  { name: '/next', path: '...' },
  { name: '/resume', path: '...' },
  { name: '/done', path: '...' },
  { name: '/bugfix', path: '...' },
  { name: 'scenarios', path: '...', internal: true },  // 内部标记，不直接暴露给用户
  { name: 'progress-tracking', path: '...', internal: true },
  { name: 'session-handoff', path: '...', internal: true },
]
```

---

### 问题6：progress-tracking skill 的测试命令配置不符合设计

**在 progress-tracking.md 中**：
```markdown
Execute the test command from `.forge/config.json.test_command`
```

**设计文档说**：
> 自动探测（npm test / pytest / go test 等）

**问题**：
虽然实现用了 config.json 记录探测结果，但这意味着如果项目改变测试框架（例如从 Jest 改成 Vitest），用户必须手动更新 config.json。

**应该怎么做**：
每次运行时重新探测，或者两者结合：
```markdown
1. 读取 .forge/config.json.test_command（如果存在）
2. 如果不存在或为空，自动探测：
   - 检查 package.json 的 scripts.test
   - 检查 pytest.ini
   - 检查 go.mod
   - 等等
3. 运行探测到的命令
```

---

### 问题7：缺少 gstack 集成询问

**设计文档说**：
> forge init 时询问："是否安装 gstack 开启增强测试？"

**实际实现**：
init.ts 没有任何 gstack 相关的询问逻辑，只是硬编码 `gstack_installed: false`。

**应该怎么做**：
```typescript
// 在 runInit 中添加
const readline = await import('readline/promises');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const installGstack = await rl.question(
  'Install gstack for enhanced testing (browser tests, visual QA, performance)? (y/n): '
);

if (installGstack.toLowerCase() === 'y') {
  console.log('Installing gstack...');
  // 执行 git clone https://github.com/garrytan/gstack ...
  config.gstack_installed = true;
  config.test_mode = 'enhanced';
}
```

---

### 问题8：Superpowers 路径检测不准确

**在 init.ts 中**：
```typescript
const hasSuperpowers = await detectSuperpowers(projectRoot);
if (!hasSuperpowers) {
  warnings.push(
    'Superpowers not detected. Install with: git clone https://github.com/anomalyco/superpowers ~/.agents/skills/superpowers',
  );
}
```

**问题**：
1. 检测逻辑在 `detectSuperpowers` 里，但从 init.ts 看不出它检测的是什么路径
2. 建议的安装路径是 `~/.agents/skills/superpowers`，但现在主流路径是 `~/.claude/skills/superpowers`
3. 不同平台（Claude Code vs Codex vs OpenCode）的 skill 路径可能不同

**应该怎么做**：
```typescript
const commonPaths = [
  '~/.claude/skills/superpowers',
  '~/.agents/skills/superpowers',
  '~/.cursor/skills/superpowers',
];

const hasSuperpowers = await detectSuperpowersInPaths(commonPaths);
if (!hasSuperpowers) {
  warnings.push(
    'Superpowers not detected in common paths. Install with:\n' +
    '  git clone https://github.com/obra/superpowers ~/.claude/skills/superpowers\n' +
    '  Or your platform-specific skills directory'
  );
}
```

---

## 缺失的功能

### 缺失1：没有 `forge skills install` 的实现

**skills.ts 中**：
```typescript
export async function runSkillsInstall(projectRoot: string): Promise<Result> {
  // TODO: implement
  return { success: false, error: 'Not implemented', output: '' };
}
```

**设计文档说**：
> forge init 做三件事之一：生成 skill 文件和目录结构

**应该怎么做**：
实现 `runSkillsInstall`，将 `forge-skill/` 下的所有 .md 文件复制到项目的 `.forge/skills/` 或平台特定路径。

---

### 缺失2：没有实现多平台 manifest 的实际差异

**当前 manifest.ts**：
对所有平台生成相同的 manifest 内容，只是路径不同（`.claude-plugin` vs `.opencode` vs `.codex-plugin`）。

**设计文档说**：
> skill 写一份，各平台一个薄 manifest + bootstrap mapping

**应该怎么做**：
不同平台的 manifest 格式可能不同，需要针对每个平台生成正确格式：

```typescript
// Claude Code
{
  "name": "forge",
  "skills": [
    { "path": "skills/start.md", "name": "/start" }
  ]
}

// Codex
{
  "name": "forge",
  "skills": [
    { "file": "skills/start.md", "command": "forge:start" }
  ],
  "bootstrap": "skills/codex-bootstrap.md"
}

// OpenCode
{
  "name": "forge",
  "commands": [
    { "name": "start", "file": "skills/start.md" }
  ]
}
```

---

### 缺失3：没有 batch cutting 的具体实现

**next.md 中**：
```markdown
Run `forge execute batch cut` or perform manually:
  - Topological sort by dependencies
  - Chunk into batches of max 6 tasks
  - Respect dependency order
```

**问题**：
"perform manually" 是什么意思？Skill 应该告诉 AI 具体怎么做，而不是"手动执行"。

**应该怎么做**：
在 next.md 里给出明确的批次切割算法：

```markdown
## 批次切割算法

1. 读取 full-plan.md，提取所有 task 及其依赖
2. 构建依赖图
3. 拓扑排序
4. 按顺序分组，每组最多 6 个 task
5. 对每个 batch 写入 batch-N.md

例如：
Task 1: 无依赖
Task 2: 依赖 Task 1
Task 3: 无依赖
Task 4: 依赖 Task 2
Task 5: 无依赖
Task 6: 无依赖
Task 7: 依赖 Task 3

批次划分：
Batch 1: Task 1, 3, 5, 6（无依赖，可并行概念上，但实际执行时串行）
Batch 2: Task 2, 7（依赖 Batch 1 的结果）
Batch 3: Task 4（依赖 Task 2）
```

---

## 正确的部分

### ✅ 类型定义完善

`types/index.ts` 的 Zod schema 和 TypeScript 类型定义很好，完全符合设计文档的 JSON schema。

### ✅ 目录结构正确

init 生成的目录结构符合设计：
```
docs/forge/specs/
docs/forge/changes/
docs/forge/changes/archive/
docs/forge/decisions/
.forge/
```

### ✅ progress.json 和 config.json 格式正确

两个核心状态文件的结构和字段都符合设计。

### ✅ scenarios skill 逻辑基本正确

scenarios.md 的 Given/When/Then 生成逻辑、优先级分配、测试类型映射都符合设计。

### ✅ session-handoff skill 逻辑正确

CLAUDE.md 更新、恢复指令生成、状态验证都符合设计。

### ✅ 测试框架自动探测

`detect.ts` 的测试框架探测逻辑是好的（虽然 progress-tracking skill 没有用好）。

---

## 修复优先级

### P0（必须修复，否则系统无法按设计工作）

1. **删除不必要的 CLI 命令**：`forge resume`、`forge done`、`forge bugfix`、`forge execute`
2. **Skill 不调用 CLI 命令**：所有 skill 直接操作文件，不通过 CLI
3. **明确 Superpowers skill 调用方式**：在 skill 文档里给出具体调用语法
4. **修复 manifest 路径**：使用相对路径或可配置路径，不硬编码 `~/.agents/skills/`
5. **实现 `forge skills install`**：复制 skill 文件到项目本地

### P1（应该修复，影响用户体验）

6. **添加 gstack 安装询问**：init 时交互式询问
7. **修复 Superpowers 路径检测**：支持多个常见路径
8. **manifest 包含内部 skill**：scenarios、progress-tracking、session-handoff
9. **批次切割算法明确化**：在 skill 文档里给出具体步骤

### P2（可选，改进质量）

10. **多平台 manifest 格式差异**：针对不同平台生成正确格式
11. **测试命令动态探测**：每次运行时重新探测，不只依赖 config.json

---

## 建议的修复路径

### 阶段1：修复核心架构问题（P0）

1. 删除 `index.ts` 中的 `forge resume`、`forge done`、`forge bugfix`、`forge execute` 命令
2. 删除对应的 `commands/resume.ts`、`commands/done.ts`、`commands/bugfix.ts`、`commands/execute.ts`
3. 修改所有 skill 文档，去掉 CLI 调用，改为直接文件操作
4. 实现 `runSkillsInstall`：复制 skill 文件到 `.forge/skills/`
5. 修改 manifest.ts：使用 `.forge/skills/` 相对路径

### 阶段2：完善用户体验（P1）

6. 在 init.ts 添加 gstack 安装询问和实际安装逻辑
7. 改进 detectSuperpowers 支持多路径
8. manifest 添加内部 skill
9. next.md 添加批次切割详细算法

### 阶段3：多平台支持（P2）

10. 研究各平台 manifest 格式差异，针对性生成

---

## 总结

**核心问题**：CLI 做了太多不该做的事，Skill 又反过来依赖 CLI，违反了设计原则。

**解决方向**：严格遵守"纯 skill + 极轻量 CLI"的设计，CLI 只做初始化和配置管理，所有执行逻辑在 Skill 里完成。

**好的方面**：类型定义、数据结构、核心逻辑思路都是正确的，只需要调整职责边界。
