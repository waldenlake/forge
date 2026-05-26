# Forge · AI-Native Engineering Runtime
## Core Philosophy & Architecture

> 这份文档是 Forge 所有设计决策的根源。
> 每一条 CLI 命令、每一个 skill 文件、每一次 schema 校验，
> 都应当能在这里找到它存在的理由。

---

# 一、为什么需要 Runtime

LLM 的推理本质是概率性的（probabilistic）。这带来一个根本矛盾：

**AI 天然优化 narrative consistency，而不是 reality consistency。**

具体表现为：

- 会声称任务已完成，但测试从未运行过
- 会跳过 spec 直接写代码，然后边写边改需求
- 会在长任务中丢失早期的架构决策
- 会把"我认为应该能工作"当成"已验证可以工作"
- 会在 execution 阶段悄悄修改设计，没有任何记录

这些不是模型的缺陷，而是 LLM 推理的结构性特征。
**不能靠提示词修复，只能靠 Runtime 约束。**

Forge 就是这个 Runtime。

---

# 二、三条核心原则

## 原则一：Runtime 不控制 Reasoning

LLM 在每个阶段内部怎么思考、怎么分析、怎么生成——Runtime 不干预，也无法可靠干预。

试图用指令控制推理过程会导致：

| 症状 | 根因 |
|------|------|
| Workflow explosion | 试图覆盖所有推理路径 |
| Semantic creep | 自然语言指令被模型重新诠释 |
| Brittle orchestration | 模型跳过"不重要的"步骤 |
| AI worker 化 | 模型失去自主性，质量下降 |

**Runtime 控制的边界是：phase 之间的 transition 条件，不是 phase 内部的推理过程。**

```
✓ 允许控制：从 planning 进入 execution，必须先有 verified scenarios
✗ 不应控制：AI 在 planning 阶段内部如何分析需求
```

## 原则二：Runtime 控制 Workflow

这里的 Workflow 不是业务流程，而是 **Engineering Discipline**——
一套防止认知漂移（cognitive drift）的工程纪律约束。

### Workflow 要防止什么

| 认知漂移类型 | 表现 | Workflow 对策 |
|-------------|------|--------------|
| Context collapse | 长任务中丢失早期决策 | Task decomposition + checkpoints |
| Architecture entropy | 每次实现都在悄悄修改架构 | Spec before implementation |
| Hallucinated completion | 声称完成但未验证 | Verification before promotion |
| Uncontrolled exploration | Execution 阶段改设计 | Phase boundary enforcement |
| Local optimum traps | 为当前任务牺牲整体一致性 | Periodic Guard reviews |

### Workflow 强制的工程纪律

```
Spec → Scenarios → Plan → Execute → Verify → Promote
```

每个箭头都是一次 phase transition。
**Transition 必须满足前置条件，否则 Runtime 拒绝推进。**

这不是为了限制 AI，而是为了给 AI 的认知提供结构：
有了结构，AI 才能在每个 phase 内部充分发挥推理能力。

## 原则三：Runtime 控制 Verification

Verification 是整个系统的"现实边界"。

AI 可以说"测试通过了"，但 Runtime 必须亲自跑测试。
AI 可以说"任务完成了"，但 Runtime 必须验证 git commit 存在。
AI 可以说"状态已更新"，但 Runtime 必须回读文件确认。

**Runtime 是系统唯一的 Reality Authority。**

凡是需要"这件事真的发生了"的断言，必须由 Runtime 出具，不能由 AI 自报。

---

# 三、State as Contract

这是连接"认知约束"和"现实维护"的核心机制。

## 什么是 State as Contract

Forge 的状态文件不只是数据存储，而是 **AI 与 Runtime 之间的合同**：

```
.forge/progress.json   ← 工程进度合同
.forge/scenarios.json  ← 验收标准合同
.forge/config.json     ← 项目规则合同
<memory_file>          ← 跨会话知识合同
```

**合同的含义：**

- AI 的每一步行动，必须通过 Runtime CLI 修改合同来"登记现实"
- AI 不能直接修改合同内容（绕过 CLI 直接写 JSON 等于绕过合同）
- Runtime 通过验证合同完整性来拒绝虚假的 promotion

## 合同的三个不变量

**1. 状态合法性（Schema Invariant）**
合同的每一个字段必须符合 schema，任何写入都经过校验，
不存在"格式正确但语义非法"的中间状态。

**2. 状态可追踪（Audit Invariant）**
每一次状态转换都有记录（git commit tag、guard_history、updated_at），
任何状态都可以追溯到是谁在什么时候因为什么原因转换的。

**3. 状态可恢复（Recovery Invariant）**
即使合同文件损坏，也能从 git history 重建。
系统永远有出口，永远不会进入无法恢复的死锁状态。

---

# 四、AI 的行为边界

明确 AI 在 Forge 框架内的角色，防止边界模糊导致系统退化。

## Spec / Planning Phase：AI 是设计者

在这两个 phase 内，AI 拥有充分的自由度：

- 可以探索（exploration）：提出多种方案
- 可以适应（adaptation）：根据用户反馈修改设计
- 可以质疑（questioning）：挑战需求的合理性
- 可以建议（suggestion）：提出超出原始需求的改进

Runtime 在这个阶段只做一件事：等待 AI 和用户达成共识，然后将结果固化为合同（scenarios.json）。

## Execution Phase：AI 是实现者

一旦进入 execution，scenarios.json 就是不可更改的验收标准。

- **允许**：在任务范围内自主决定实现细节
- **允许**：发现技术问题并修复
- **不允许**：修改 spec 或 scenarios
- **不允许**：在没有 Runtime 确认的情况下声称任务完成
- **不允许**：跳过 verification 直接进入下一个任务

**如果 execution 阶段发现需求有误，必须显式退回 planning phase，重新走 spec → scenarios 流程。**
不能在 execution 阶段悄悄修改设计，这是 architecture entropy 的主要来源。

## Verification Phase：AI 是解读者

Runtime 执行测试，AI 解读结果并决定下一步：

- Runtime 告知：4 个测试失败，具体文件和行号
- AI 决策：是修复代码（继续 execution）还是重新规划（退回 planning）

**AI 不能伪造 verification 结果，Runtime 不能替 AI 做修复决策。**

---

# 五、三层结构

```
┌─────────────────────────────────────────────────────────┐
│  AI Layer                                               │
│                                                         │
│  reasoning · planning · generation · exploration        │
│  （在 phase 内部自由运作，Runtime 不干预）               │
└───────────────────────┬─────────────────────────────────┘
                        │ phase transition 请求
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Workflow Layer                                         │
│                                                         │
│  phase boundary enforcement                             │
│  task structure · checkpointing · Guard scheduling      │
│  （触发验证请求，管理 phase transition）                 │
└───────────────────────┬─────────────────────────────────┘
                        │ verification 请求
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Verification Layer                                     │
│                                                         │
│  test execution · schema validation · audit trail       │
│  state promotion · reality authority                    │
│  （执行验证，出具 artifact，决定 promote 或 reject）     │
└───────────────────────┬─────────────────────────────────┘
                        │ promote
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Canonical State                                        │
│                                                         │
│  progress.json · scenarios.json · git history           │
│  memory file · verification artifacts                   │
│  （经过验证的现实，是系统的唯一真相来源）                │
└─────────────────────────────────────────────────────────┘
```

### 两条数据流

**向下（execution flow）：**
AI 的意图通过 Workflow 约束，经过 Verification 验证，才能写入 Canonical State。

**向上（recovery flow）：**
新会话启动时，从 Canonical State 读取状态，通过 Workflow 重建上下文，AI 恢复执行。

这两条流的健康程度，决定了系统的可靠性上限。

---

# 六、Forge 的最终定位

Forge 是 **AI-Native Engineering Runtime**。

它不是：
- Workflow engine（不控制业务流程）
- Test framework（不关心测试怎么写）
- Orchestration system（不控制 AI 推理）
- Prompt engineering framework（不试图让 AI 更聪明）

它是：**Engineering Cognition Runtime**

负责四件事，缺一不可：

```
1. Stabilize AI Cognition
   通过 Workflow discipline 防止认知漂移
   → phase 边界、task 结构、checkpoint

2. Enforce Engineering Invariants
   通过 State as Contract 维护系统一致性
   → schema 校验、回读验证、审计追踪

3. Prevent Hallucinated Reality
   通过 Verification 建立现实边界
   → 测试必须真正运行、commit 必须真正存在

4. Maintain Canonical Engineering State
   通过 Recovery Invariant 确保系统永远可恢复
   → git history 重建、备份、reset 出口
```

---

# 七、设计决策准则

当面临一个具体的设计选择时，用以下问题检验：

**Q1：这个逻辑依赖 AI 自觉执行吗？**
如果是，它属于 Workflow 或 Verification Layer，必须下沉到 CLI。
Skill 文件只负责调用 CLI 并解读输出。

**Q2：这个操作改变了"现实"吗？**
运行测试、创建 commit、写入状态文件——这些都改变现实。
改变现实的操作必须由 Runtime 执行，不能由 AI 自报完成。

**Q3：这个 phase transition 的前置条件是否可机器验证？**
如果前置条件是"AI 认为设计已经足够好"，这不够——需要转化为
"scenarios.json 存在且包含至少一个 P0 场景"这样的可验证条件。

**Q4：如果这里出错，系统能恢复吗？**
每个关键操作都要有对应的恢复路径。
不存在恢复路径的操作，要么加 `--backup`，要么拒绝执行。

---

*Forge core philosophy · 与所有技术决策保持一致是这份文档的责任。*
*每当系统设计偏离这里的原则时，应当修改系统，而不是修改原则。*
