# Forge Marketplace 实现审查（新架构）

基于参考 Superpowers 重新设计后的版本

---

## 总体评价

**这次的实现是巨大的改进。**

完全符合设计文档的"纯 skill + 极轻量 CLI"原则。架构清晰，职责边界明确，多平台支持方案正确。几乎所有之前审查中提出的 P0 和 P1 问题都已修复。

---

## 架构改进对比

### 之前的问题 vs 现在的解决

| 问题 | 之前 | 现在 | 评价 |
|------|------|------|------|
| **CLI 过重** | 包含 resume、done、bugfix、execute 等命令 | **完全移除 CLI**，只保留 plugin 定义 | ✅ 完美 |
| **Skill 调用 CLI** | Skill 里调用 `forge execute` 命令 | Skill 直接操作文件，不依赖 CLI | ✅ 完美 |
| **Manifest 硬编码路径** | 使用 `~/.agents/skills/forge/` 绝对路径 | 使用 Plugin 机制自动发现 skills | ✅ 完美 |
| **缺少内部 skill** | scenarios、progress-tracking 不在 manifest | 所有 skill 都在 skills/ 目录，自动发现 | ✅ 完美 |
| **多平台支持** | 只有 manifest.ts，未实现差异 | Claude Code（hooks）+ OpenCode（plugin.js）各自实现 | ✅ 完美 |

---

## 核心设计亮点

### ✅ 1. Superpowers 式的目录结构

```
forge/
  skills/
    start/SKILL.md
    next/SKILL.md
    scenarios/SKILL.md
    progress-tracking/SKILL.md
    session-handoff/SKILL.md
    bugfix/SKILL.md
    done/SKILL.md
    resume/SKILL.md
    using-forge/SKILL.md     ← meta-skill，自动注入
  hooks/
    session-start             ← 注入 using-forge
  .claude-plugin/
    plugin.json
  .opencode/
    plugins/forge.js
```

每个 skill 独立目录，自包含，符合 Superpowers 的设计哲学。

---

### ✅ 2. session-start hook 的巧妙使用

**session-start hook 自动注入 using-forge skill 的内容**，这样：
- 每个 session 启动时，AI 自动知道 forge 的存在和用法
- 用户不需要手动加载 using-forge skill
- 跨平台兼容（Claude Code、Cursor、Copilot 格式都支持）

这比 Superpowers 的设计更聪明——Superpowers 需要用户手动加载 `using-superpowers` skill，而 forge 自动注入。

---

### ✅ 3. 多平台适配的正确实现

**Claude Code（hooks）：**
```bash
# session-start hook 读取 using-forge/SKILL.md 并注入到 context
# 输出格式根据 $CLAUDE_PLUGIN_ROOT 变量自动识别
```

**OpenCode（plugin.js）：**
```javascript
// 注册 skills 目录到 config.skills.paths
// 通过 message transform 注入 using-forge 内容
// 附加 tool mapping（OpenCode 工具名映射）
```

两个平台各自用自己的机制实现同样的效果，这是正确的做法。

---

### ✅ 4. 自动初始化逻辑清晰

**start/SKILL.md 里的 Auto-Initialization：**
- 检测项目类型（new vs existing）
- 检测 Superpowers（必需）
- 检测 GitNexus（existing 项目推荐）
- 检测 gstack（可选）
- 检测测试框架（自动探测）
- 创建目录结构
- 写 config.json 和 progress.json
- 更新 CLAUDE.md

第一次 `/start` 就能自动完成初始化，用户体验流畅。

---

### ✅ 5. Skill 职责划分合理

| Skill | 职责 | 调用者 |
|-------|------|--------|
| **using-forge** | 使用说明，session 启动时注入 | session-start hook |
| **start** | 需求理解、brainstorming、scenarios 生成 | 用户 |
| **next** | 规划、批次执行、验证 | 用户 |
| **resume** | 中断恢复 | 用户 |
| **done** | 归档 | 用户 |
| **bugfix** | bug 修复 | 用户 |
| **scenarios** | 生成 Given/When/Then 场景 | start skill |
| **progress-tracking** | task 完成后操作（测试、commit、更新状态） | next skill |
| **session-handoff** | 跨 session 恢复准备 | next skill |

用户直接接触的只有 5 个命令（start、next、resume、done、bugfix），其他 3 个是内部 skill，自动调用。

---

## 细节审查

### ✅ 1. start skill 的品牌 header

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ⚒  F O R G E  v0.1.0               ┃
┃  AI-Driven Development Orchestration  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

这个细节很好，增强品牌识别度，让用户知道自己在用 forge。

---

### ✅ 2. 进度输出格式统一

所有 skill 都使用统一的输出格式：

```
⚒ forge · /next
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ Phase 4 · Planning
    → Generating implementation plan...
    ✓ full-plan.md written (16 tasks)
    → Cutting batches...
    ✓ 3 batches created

▸ Phase 5 · Execution (Batch 1/3)
    → Task 1: Create User model...
    ✓ Task 1: done
    ...
```

清晰、一致、专业。

---

### ✅ 3. Context 管理正确实现

**progress-tracking/SKILL.md 的 Step 5：**

```markdown
### Step 5: Context Discipline

**CRITICAL:** After this skill completes, the orchestrator (the session
running /next) MUST NOT retain detailed results in conversation history.

The orchestrator records ONLY:
```
Task <id>: done
```

That's it. Four words maximum per task.
```

这个强调很重要，确保 orchestrator 的 context 只增长 4 个 token/task，而不是几百个。

---

### ✅ 4. 批次切割算法明确

**next/SKILL.md Scenario A Step 3：**

```markdown
**Algorithm:**

1. Parse all tasks...
2. Build dependency graph.
3. Topological sort
4. Read batch size from config.json
5. Group into batches...
6. Write each batch to a separate file
```

不再是"手动执行"或"调用 CLI 命令"，而是给出了明确的算法步骤。AI 可以直接实现。

---

### ✅ 5. 场景生成规则详细

**scenarios/SKILL.md 包含：**
- 如何从 proposal 提取可测试行为
- Given/When/Then 的写作规则
- 测试类型分配规则
- 优先级判断规则
- mockup.html 的处理逻辑
- JSON 和 markdown 的输出格式

长达 16KB 的详细文档，AI 可以按规则生成高质量的场景。

---

### ✅ 6. OpenCode 的 tool mapping

**forge.js 里的 toolMapping：**

```javascript
**Tool Mapping for OpenCode:**
When skills reference tools you don't have, substitute OpenCode equivalents:
- `TodoWrite` → `todowrite`
- `Task` tool with subagents → Use OpenCode's subagent system (@mention)
- `Skill` tool → OpenCode's native `skill` tool
```

这解决了跨平台的工具名差异问题，符合设计文档的 "bootstrap mapping" 策略。

---

## 发现的问题

### ⚠️ 问题1：GitNexus 检测逻辑未实现

**start/SKILL.md Step 3：**
```markdown
**If existing project:**
- Check if GitNexus is available
- Available → output: `    ✓ GitNexus`
```

但没有说明"如何检查 GitNexus 是否 available"。

**建议**：

在 start/SKILL.md 里明确检测方法：

```markdown
### Step 3: Check GitNexus

**If existing project:**

1. Try to load GitNexus skill (use Skill tool to check if gitnexus/analyze exists)
2. If successful:
   - Output: `    ✓ GitNexus`
   - Continue
3. If failed:
   - Output: `    ⚠ GitNexus (recommended for existing projects)`
   - Add to warnings: "Install GitNexus for codebase analysis: npm install -g @gitnexus/cli"
   - Continue (non-blocking)
```

---

### ⚠️ 问题2：gstack 检测也未明确

**start/SKILL.md Step 4：**
```markdown
- Check if gstack is available
```

同样没有说明检测方法。

**建议**：
```markdown
1. Try to load gstack/qa skill
2. If successful: output `    ✓ gstack`
3. If failed: output `    · gstack (optional)`, continue
```

---

### ⚠️ 问题3：测试框架检测表格不完整

**start/SKILL.md Step 5：**

检测表格只包含了常见的框架，但对于一些语言缺失：

| 语言 | 缺失的框架 |
|------|-----------|
| Python | unittest（标准库）、nose |
| JavaScript | ava、tap |
| Ruby | RSpec、Minitest |
| PHP | PHPUnit |
| Java | JUnit |

**建议**：

扩展检测表格，或者加一个兜底逻辑：

```markdown
| `package.json` | `scripts.test` exists (any value) | extract framework from command, command itself |
```

这样即使框架不在表格里，只要 package.json 有 `"test": "..."` 也能检测到命令。

---

### ⚠️ 问题4：scenarios skill 的 `then[].type` 字段语义不清

**scenarios/SKILL.md scenarios.json schema：**

```json
{
  "then": [
    {
      "assertion": "...",
      "type": "result|side-effect|state-change|error"
    }
  ]
}
```

但后面的 Field specifications 表格里：

```
scenarios[].then[].type | string | One of: `result`, `side-effect`, `state-change`, `error`
```

这个字段的用途不明确。后续的 planning、execution、testing 都没有用到这个字段。

**建议**：

如果这个字段没有下游用途，删除它，简化 schema：

```json
{
  "then": [
    { "assertion": "..." }
  ]
}
```

或者明确说明它的用途：

```markdown
### then[].type 字段的用途

用于指导测试实现：
- `result`: 验证函数返回值或 API 响应
- `side-effect`: 验证副作用（如数据库变更、文件写入）
- `state-change`: 验证状态转换（如 UI 状态、应用状态）
- `error`: 验证错误抛出或错误处理
```

---

### ⚠️ 问题5：OpenCode plugin 的 frontmatter 解析过于简单

**forge.js 里的 extractAndStripFrontmatter：**

```javascript
const extractAndStripFrontmatter = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, content };
  const body = match[2];
  return { frontmatter: {}, content: body };
};
```

问题：
- 解析了 frontmatter 但 `frontmatter: {}` 是空对象，没有实际解析 YAML
- 函数名暗示会提取 frontmatter，但实际只是剥离了

**建议**：

如果不需要解析 frontmatter 内容，函数名应该改为 `stripFrontmatter`：

```javascript
const stripFrontmatter = (content) => {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return match ? match[1] : content;
};
```

或者真正解析 frontmatter（如果需要的话）：

```javascript
import yaml from 'yaml';

const extractAndStripFrontmatter = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, content };
  try {
    return {
      frontmatter: yaml.parse(match[1]),
      content: match[2]
    };
  } catch {
    return { frontmatter: {}, content };
  }
};
```

---

### ⚠️ 问题6：session-start hook 的多平台格式判断可能不准确

**session-start hook：**

```bash
if [ -n "${CURSOR_PLUGIN_ROOT:-}" ]; then
  # Cursor format
  printf '{\n  "additional_context": "%s"\n}\n' "$session_context"
elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -z "${COPILOT_CLI:-}" ]; then
  # Claude Code format
  printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "SessionStart",\n    "additionalContext": "%s"\n  }\n}\n' "$session_context"
else
  # Copilot CLI or unknown platform — SDK standard format
  printf '{\n  "additional_context": "%s"\n}\n' "$session_context"
fi
```

问题：
- 如果同时存在 `CLAUDE_PLUGIN_ROOT` 和 `COPILOT_CLI`（理论上可能），会走 else 分支
- 未来可能有新平台，无法识别

**建议**：

加一个 debug 输出（可选），或者日志记录平台检测结果：

```bash
# Debug logging (optional, for troubleshooting)
# echo "Platform detected: CURSOR=${CURSOR_PLUGIN_ROOT:-unset}, CLAUDE=${CLAUDE_PLUGIN_ROOT:-unset}, COPILOT=${COPILOT_CLI:-unset}" >&2
```

或者简化判断：

```bash
# 根据环境变量优先级判断平台
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  # Claude Code
  ...
elif [ -n "${CURSOR_PLUGIN_ROOT:-}" ]; then
  # Cursor
  ...
else
  # Fallback
  ...
fi
```

---

### ⚠️ 问题7：缺少对 Windows 的路径处理

**session-start hook 是 bash 脚本：**

```bash
#!/usr/bin/env bash
```

在 Windows 上：
- bash 脚本需要 Git Bash、WSL 或 Cygwin
- 路径可能包含反斜杠和盘符

**run-hook.cmd 存在**，但它的作用是什么？

**建议**：

查看 run-hook.cmd 是否正确处理了 Windows 环境。如果没有，需要：

1. run-hook.cmd 应该检测 bash 是否可用
2. 如果不可用，用 PowerShell 或纯 cmd 脚本实现相同逻辑
3. 或者在 README 里明确说明 Windows 需要 Git Bash

---

### ⚠️ 问题8：OpenCode plugin 的 guard 逻辑可能失效

**forge.js 里的防重复注入 guard：**

```javascript
// Guard: skip if already injected
if (firstUser.parts.some(p => p.type === 'text' && p.text.includes('Forge orchestration plugin'))) return;
```

问题：
- 依赖字符串匹配 "Forge orchestration plugin"
- 如果 using-forge/SKILL.md 的内容改了，这个字符串可能不存在了

**建议**：

使用更稳定的标记：

```javascript
const FORGE_BOOTSTRAP_MARKER = '<!-- forge-bootstrap-injected -->';

// Guard
if (firstUser.parts.some(p => p.type === 'text' && p.text.includes(FORGE_BOOTSTRAP_MARKER))) return;

// Inject with marker
const bootstrapWithMarker = `${FORGE_BOOTSTRAP_MARKER}\n${bootstrap}`;
firstUser.parts.unshift({ ...ref, type: 'text', text: bootstrapWithMarker });
```

---

## 未实现的部分（设计文档有，但当前代码没有）

### ❓ 1. gstack 集成（Phase 2）

设计文档说 Phase 2 加入 gstack，但当前 skills 里没有任何 gstack 相关的逻辑。

**符合预期**，因为这是 Phase 2 的内容，当前只实现了 Phase 1。

---

### ❓ 2. GitNexus blast radius 分析

**设计文档 next/SKILL.md Scenario A Step 1：**
> GitNexus blast radius 分析每个 task

**实际 next/SKILL.md：**
> 只提到"GitNexus dependency information (if available from Step 1)"

没有明确的 blast radius 调用。

**建议**：

在 next/SKILL.md Scenario B（Execute Current Batch）里明确：

```markdown
3. **Dispatch subagent:**
   ...
   - Impact analysis from GitNexus (if available):
     * Run GitNexus blast-radius query for affected files
     * Include in subagent context
```

---

### ❓ 3. 批次完成后的集成测试

**设计文档 next/SKILL.md Scenario B 批次完成后：**
> 2. **Run integration tests** (if configured)

**实际 next/SKILL.md：**
没有提到集成测试。

**建议**：

在批次完成后加一步：

```markdown
2. **Run integration tests** (if test_coverage.integration > 0):
   - Run integration test command (from config.json or auto-detect)
   - Record results
   - If failed → output failures, stop
```

---

## 缺失的文档

### 📄 需要补充的文档

**1. CONTRIBUTING.md**
如果这是要发布到 marketplace 的项目，需要贡献指南。

**2. CHANGELOG.md**
版本变更记录。

**3. examples/**
示例项目，展示 forge 的完整使用流程。

**4. tests/ 或 test-plan.md**
虽然 forge 本身是 orchestration 工具，但至少应该有：
- skills 的语法验证测试
- progress.json schema 验证测试
- scenarios.json schema 验证测试

---

## 正确的设计决策

以下是我认为做得特别好的设计：

### ✅ 1. 不重新实现 CLI

完全去掉 CLI，只用 plugin 机制。这比之前的方案轻量太多。

### ✅ 2. using-forge 自动注入

用 session-start hook / plugin transform 自动注入使用说明，比 Superpowers 的手动加载更友好。

### ✅ 3. 内部 skill 的划分

scenarios、progress-tracking、session-handoff 作为内部 skill，不暴露给用户，保持用户界面简洁。

### ✅ 4. 统一的输出格式

所有 skill 用一致的进度条、品牌 header、状态输出，专业且易识别。

### ✅ 5. 文件即状态

progress.json、config.json、CLAUDE.md、scenarios.json 都是结构化文件，任何时候可以从文件恢复状态，不依赖对话历史。

### ✅ 6. Skill 文档的详细程度

每个 skill 都包含：
- 触发条件
- 前置检查
- 详细步骤
- 错误处理
- 输出格式
- 依赖的其他 skill

这样的文档质量确保 AI 可以正确执行。

---

## 修复优先级

### P0（必须修复）

**无**。当前实现没有阻止系统工作的严重问题。

### P1（应该修复，改善体验）

1. **明确 GitNexus 和 gstack 的检测逻辑**（start/SKILL.md）
2. **扩展测试框架检测表格**（start/SKILL.md）
3. **明确或删除 scenarios then[].type 字段**（scenarios/SKILL.md）
4. **修复 OpenCode plugin 的 guard 逻辑**（forge.js）

### P2（可选，提升质量）

5. **简化 frontmatter 解析函数**（forge.js）
6. **改进 session-start hook 的平台检测**（session-start）
7. **确认 Windows 支持**（run-hook.cmd）
8. **加入集成测试步骤**（next/SKILL.md）
9. **补充 GitNexus blast radius 调用**（next/SKILL.md）

### P3（文档和示例）

10. **添加 CONTRIBUTING.md、CHANGELOG.md、examples/**

---

## 总结

**这次的实现质量很高。**

核心架构完全符合设计文档，参考 Superpowers 的目录结构是正确的选择。多平台支持方案（Claude Code hooks + OpenCode plugin）是业界标准做法。Skill 文档详细且可执行。

**主要问题集中在细节**：
- 检测逻辑（GitNexus、gstack、测试框架）需要明确
- 部分 schema 字段（scenarios then[].type）语义不清
- 跨平台兼容性细节（Windows、guard 逻辑）需要加固

**优先修复 P1 问题**，P2 和 P3 可以逐步完善。

**Phase 1 MVP 已经可以发布了。** 功能完整，架构清晰，文档详细。修复 P1 问题后可以作为 v0.1.0 release。
