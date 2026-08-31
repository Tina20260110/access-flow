# AccessFlow 项目协作指南

## 适用范围与规则优先级

本文件适用于整个仓库。若子目录存在更具体的 `AGENTS.md`，则该文件只在对应目录内补充或覆盖本指南。

所有工作必须同时遵守 `.specify/memory/constitution.md`。规则冲突时按以下优先级处理：

1. 项目 Constitution；
2. 已确认的 `spec.md`；
3. `plan.md`、`data-model.md` 和 `contracts/`；
4. `tasks.md`；
5. `quickstart.md` 与本文件中的执行约定。

不得通过修改低优先级产物绕过高优先级约束。发现产物不一致时，先停止相关实现并说明问题，再通过对应
Spec Kit 工作流修订设计。

## 项目现状与目标

AccessFlow 是一个从零开发的企业内部访问权限申请与审批前端 MVP。当前批准的功能目录为
`specs/001-access-request-mvp/`，实施必须以其中的 specification、technical plan、data model、contracts、
tasks 和 quickstart 为依据。

当前技术方案已经确定为单包 React SPA：

- Node.js `22.22+` 与 npm 单一 lockfile；
- React + TypeScript strict + Vite；
- React Router 管理路由与 URL state；
- TanStack Query 管理 server state；
- React Hook Form + Zod 管理表单和运行时校验；
- Tailwind CSS 提供样式；
- IndexedDB + `idb` 作为演示业务数据的持久化来源；
- Vitest、React Testing Library 和 Playwright 分层验证业务行为。

MVP 不实现真实后端、完整认证、Admin、RBAC、多级审批、组织架构、跨浏览器数据共享或多 Tab 实时同步。
不得为这些范围外能力提前增加接口、状态、角色、依赖或抽象层。

## 中文规范

- 与用户的沟通、进度更新、问题说明、评审意见和最终总结必须使用简体中文。
- 所有新建或更新的项目文档必须使用简体中文，包括规格、计划、任务、清单、报告和说明文件。
- 所有 `spec.md` 必须使用中文编写，标题、需求、用户故事、验收标准、边界条件和补充说明不得遗漏中文表达。
- 测试描述、代码注释和面向用户的文本默认使用中文；外部协议或工具有固定约定时可以保留原文。
- 源代码标识符、API 字段、命令、文件路径、协议、标准及第三方专有名词可以使用原文，但相关解释必须使用中文。
- 引用外语资料时必须提供中文说明或摘要。确需交付其他语言内容时，必须记录原因和适用范围。

## Spec-Driven Development 工作流

- 开始工作前阅读 `.specify/memory/constitution.md`、当前功能的 `spec.md`、`plan.md` 和 `tasks.md`；涉及领域、
  数据或路由时继续读取 `data-model.md` 和对应 contract。
- specification 只定义 WHAT / WHY；technical plan 和 design artifacts 定义 HOW；实施不得把新的业务决定
  隐式写进代码。
- 严格按照 `tasks.md` 的依赖顺序推进。Phase 1/2 是所有用户故事的基础，未通过对应 Checkpoint 前不得跳到
  依赖它的 UI 工作。
- 任务只有在实现完成、相关测试通过且满足描述中的验收条件后才能勾选。不得提前或批量标记未验证任务。
- 发现会改变用户流程、数据模型、公共契约或架构的缺口时，不得自行扩展范围；先更新相应设计产物并重新做
  一致性分析。
- 保持实现、测试、tasks 状态和 Git 历史可相互追溯。

## 工作区与修改纪律

- 修改前先检查 `git status`、相关文件和现有约定，识别用户尚未提交的改动。
- 用户已有改动属于用户；不得覆盖、回退、重写或顺手整理与当前逻辑工作单元无关的内容。
- 只修改完成当前任务所需的文件。避免无需求依据的大规模重构、格式化或目录迁移。
- 优先复用已存在且语义一致的能力；不得为了未来可能复用而创建通用基类、笼统 `shared/utils` 或额外状态层。
- 新增依赖前必须确认 `plan.md` 已包含该依赖或先取得明确批准，并说明它解决的现有问题和替代方案。
- 不得使用跳过测试、关闭类型检查、禁用 lint 规则或宽泛断言的方式让检查表面通过。

## 架构与状态边界

依赖方向必须保持为：

```text
pages / feature components
  → URL state / local UI state / TanStack Query
  → AccessFlowGateway
  → domain rules + Zod boundaries
  → IndexedDB adapter
```

- `domain` 必须保持纯净，不依赖 React、Router、TanStack Query、IndexedDB 或当前用户 Context。
- `pages` 只负责路由参数、页面状态和 feature 编排，不承载重复领域规则。
- feature components 负责当前用例的交互；纯展示组件不得直接读取 Gateway 或持久化数据。
- UI 和 query hooks 只能通过 `AccessFlowGateway` 访问业务数据，不得直接读写 IndexedDB。
- `localStorage` 只允许通过专用偏好 adapter 保存并校验 `currentDemoUserId`，不得保存业务申请或 Query cache。
- IndexedDB 是业务持久化事实来源；TanStack Query cache 只是 server state 缓存。

状态必须按真实生命周期归属：

- Server State：Demo Users、Resource Catalog、申请列表、申请详情和 mutation 结果，由 Gateway + TanStack Query
  管理；本地 Gateway 的 query/mutation 使用 `networkMode: 'always'`。
- URL State：`q`、`status`、`risk`、`page`。URL 是已提交列表查询的唯一事实来源，必须支持刷新、前进后退和
  地址复制恢复。
- Local UI State：搜索草稿、拒绝原因、对话框开关和当前输入中的临时交互，保留在最小组件作用域。
- Global Client State：只允许 App 根级 Context 保存 `currentDemoUserId`；完整用户对象必须从 Demo Users 派生。

不得引入 Zustand 或其他全局状态库。不得实现 BroadcastChannel、storage event 或其他写后跨页面主动通知；
并发一致性依赖持久化事务、`revision`/`expectedRevision` 和冲突后的主动 refetch。

## 领域不变量

以下规则必须在领域层和 Gateway 边界得到保证，不能只依赖 UI：

- `DemoUser` 只表示企业员工基础身份，不包含永久 Requester、Approver、Admin、RBAC 或 `roles` 字段。
- Requester 和 Approver 是员工相对于单条申请的关系，分别由 `requesterId` 和 `approverId` 派生。
- 每条申请必须满足 `requesterId !== approverId`；任何员工都不得审批自己提交的申请。
- Resource 通过有序 `approverCandidateIds` 选择第一位不是申请人的员工作为 `approverId`；没有合格员工时阻止创建。
- 风险等级只能来自 Resource 与 Permission 的精确映射；未定义组合不得提交，不得使用默认风险补全。
- `AccessRequest` 必须使用 `Pending`、`Approved`、`Rejected` 判别联合表达合法状态，不得用大量 optional 字段
  表示互斥状态。
- 新申请从 `revision = 1` 开始。审批 command 必须携带 `expectedRevision`；首个有效决定写入终态并递增
  revision，stale client 得到 `CONFLICT` 后重新获取详情和相关列表。
- `canDecideRequest`、`canApproveRequest` 或语义等价的共享 domain capability predicates 是审批资格规则的
  唯一实现。`ApprovalPanel` 只能调用这些规则决定显示或启用操作，Gateway/transition 在事务内再次校验。
- 截止日期必须晚于提交日；批准时还必须晚于批准日。过期 Pending 申请不能批准，但仍可按正常规则拒绝。
- 拒绝原因 trim 后必须非空；终态只能包含一条与状态一致的审批记录。

## 类型安全与数据校验

- TypeScript 必须保持 strict；业务代码禁止显式 `any`、双重断言、`@ts-ignore` 或关闭检查。
- 不可信数据先以 `unknown` 表达，完成运行时校验和收窄后才能进入领域层。
- IndexedDB 读取、seed、URL 参数、表单提交、Gateway command 和 Gateway 返回值都必须经过相应 Zod schema
  或可靠的领域关系校验。
- 品牌 ID、字面量联合和判别联合应表达领域约束；不得用宽泛 `string` 或非空断言掩盖缺失校验。
- UI 校验只提供及时反馈，不能替代 Gateway 在事务边界进行的最终校验。

## UI、异步状态与无障碍

- 所有主要异步界面必须覆盖 Loading、Empty、Error、Success；mutation 必须提供进行中、成功和失败反馈。
- 可重试错误必须提供明确入口，并保留仍然有效的 URL、表单或审批上下文。
- 列表必须区分“当前员工没有可见申请”和“当前查询没有匹配结果”。
- High Risk、最终状态和关键下一步必须直接可见且不能仅通过颜色表达。
- 优先使用语义化 HTML 和原生控件；表单必须有真实 label，错误通过 `aria-invalid`、`aria-describedby` 等建立
  正确关联。
- 核心流程必须可仅通过键盘完成，并保持可见焦点、合理焦点迁移、对话框 Escape 关闭与焦点恢复。
- 动态成功和非阻塞更新使用适当 live region；错误和审批冲突必须能被辅助技术及时感知。

## 测试与验证

测试应随对应业务能力交付，不得把所有测试集中到最后：

- Unit Tests：风险映射、审批人分配、审批 capability、状态转换、URL parse/serialize、表单 schema 和持久化
  schema。
- Integration Tests：列表查询与 URL 恢复、创建、详情、审批、错误重试、焦点和动态反馈。
- E2E：真实 Chromium 中的核心业务闭环，以及 IndexedDB 持久化和 stale approval conflict。

测试关注业务行为和关键边界，不追求覆盖率数字本身。1,000 条 jsdom fixture 只验证正确性和明显算法问题；
SC-003 的正式性能验收必须在 Chromium + production preview 中按 `quickstart.md` 的协议测量。

计划中的标准命令为：

```bash
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
npm run preview
npm run test:e2e
```

在 T001 尚未建立 `package.json` 和 scripts 前，不得声称上述命令已经可用或通过。实施后优先运行与改动最相关的
最小测试集，并在 Phase 7 运行完整质量门禁。无法完成某项验证时，必须如实说明原因和风险。

## 分批实施与人工审查门禁

本项目采用分批实施方式。Codex 不得一次性执行完整 `tasks.md`。

实施目标不仅是完成代码，还需要让开发者能够逐阶段理解 Spec-Driven Development 产物如何映射到最终实现，
并对 AI 生成代码进行人工 Review。

### 实施批次

默认按照以下批次执行：

1. T001–T004：工程初始化
2. T005–T013：领域模型、领域规则、状态转换与 URL 查询模型
3. T014–T022：Gateway、测试 Adapter、IndexedDB 与 Demo Transport
4. T023–T024：Demo Identity 与应用基础设施
5. T025–T030：创建申请用户故事
6. T031–T036：申请列表用户故事
7. T037–T041：申请详情用户故事
8. T042–T047：审批用户故事
9. T048–T052：浏览器验收、可访问性与性能验证
10. T053–T056：最终质量门禁

除非用户明确要求修改批次范围，否则不得自动执行下一批。

### 每批实施规则

开始一个批次前：

1. 阅读当前批次涉及的 specification、plan、data model、contracts 和 tasks；
2. 简要说明本批次准备实现的工程目标；
3. 确认本批次依赖的前置任务已经完成；
4. 不实现当前 Task 范围之外的后续功能。

实施过程中：

- 严格按照 `tasks.md` 的依赖关系执行；
- 不因为后续任务可能需要而提前实现未来功能；
- 如果发现 specification、plan 或 contract 与实际实现存在冲突，应停止扩展实现并明确报告问题；
- 可以完成当前批次内部为了保持代码可运行所必需的小型配套修改，但必须在总结中说明；
- 遵循项目代码注释规范，只为不直观的业务原因、领域约束和重要技术取舍添加注释。

### 每批完成后的强制验证

完成当前批次后必须：

1. 更新对应的 `tasks.md` checkbox；
2. 运行当前批次最相关的测试；
3. 运行必要的 typecheck 和 lint；
4. 检查 `git diff` 和 `git status`；
5. 确认没有修改当前批次之外的不相关功能；
6. 按 Git 提交规范创建一个有意义的 commit。

### Review Gate

完成验证和 commit 后必须停止继续实施。

不得自动进入下一批 Task。

停止时向用户提供简洁的 Review Summary，包括：

- 本批完成的 Task ID；
- 新增或修改的核心文件；
- 关键实现决策；
- 哪些 specification / plan / contract 被落实；
- 添加了哪些重要测试；
- 执行了哪些验证命令及结果；
- 本次 commit hash 与 commit message；
- 建议人工重点 Review 的 3～5 个代码位置；
- 下一批将实现什么，但不得直接开始。

只有用户明确要求继续，例如：

`继续下一批`

或明确指定新的 Task 范围后，才允许继续实施。

### 禁止行为

不得：

- 一次性执行全部 `tasks.md`；
- 当前批完成后自行开始下一批；
- 为了减少交互而跨越人工 Review Gate；
- 在当前批中提前完成后续用户故事；
- 因为测试暂时失败而跳过验证并继续后续 Task；
- 为了让任务显示完成而降低、删除或绕过已有测试和类型约束。

## Git 提交规范

Codex 在实施 `tasks.md` 时应主动维护清晰的 Git 提交历史。

### 提交粒度

- 不得默认按单个 Task 提交。
- 优先以可独立理解、可独立验证的逻辑工作单元提交。
- `tasks.md` 中的 Phase / Checkpoint 是默认提交边界。
- 当一个 Phase 明显过大、包含多个独立工程能力时，可以进一步拆分为多个逻辑提交。
- 不得为了减少提交数量，把互不相关的功能塞入同一个 commit。
- 不得提交尚未达到对应 Checkpoint、明显无法运行或验证失败的中间状态。

### 提交前检查

每次准备 commit 前必须：

1. 检查 `git diff` 和 `git status`；
2. 确认只包含当前逻辑工作单元相关修改；
3. 运行与当前修改最相关的最小测试集；
4. 根据阶段需要运行 typecheck 或 lint；
5. 不得提交失败测试、已知类型错误或与当前任务无关的用户修改；
6. 更新对应的 `tasks.md` 完成状态后再一起提交。

如果验证失败，先修复问题，不得为了自动提交而忽略失败。

### Commit Message

使用简洁的 Conventional Commits 风格，例如：

- `chore: initialize React application`
- `feat: establish access request domain model`
- `feat: implement persistent access flow gateway`
- `feat: implement access request creation`
- `feat: implement searchable request list`
- `feat: implement access request details`
- `feat: implement approval workflow`
- `test: add AccessFlow end-to-end coverage`
- `fix: handle stale approval conflict`

Commit message 应描述这个提交带来的工程或业务能力，不使用 `complete T001`、`run phase 3` 等只描述任务编号或
工具操作的标题。

## 代码注释规范

代码应保持自解释性，优先通过清晰的类型、函数名、变量名和模块边界表达意图。

不要为显而易见的代码添加注释，也不要逐行翻译代码。

以下情况应适当添加简洁注释：

- 解释无法仅通过代码表达的业务原因；
- 解释重要但不直观的领域约束；
- 解释并发、revision、缓存或状态同步中的非显然行为；
- 解释为了无障碍、浏览器行为或兼容性而采用的特殊实现；
- 说明容易被未来维护者误删或“简化”的必要逻辑；
- 记录外部约束或重要取舍。

注释重点解释“为什么这样做”，而不是“这段代码做了什么”。

推荐：

```ts
// 审批必须携带读取详情时的 revision，避免 stale client 覆盖已生效的最终决定。
```

不推荐：

```ts
// 检查 revision
if (request.revision !== expectedRevision) {
```

对于复杂纯函数或领域规则，可以在函数级使用简短注释说明业务不变量，但不要重复 TypeScript 类型已经明确
表达的信息。

禁止使用大量模板化、冗余或仅为了增加“文档感”的注释。

## 交付要求

- 完成逻辑工作单元后，对照 task 描述和对应 FR/SC 检查是否真正完成，再更新 checkbox 和提交。
- 最终总结必须说明完成的能力、修改的关键文件、执行的验证及其结果，以及仍存在的风险或阻塞。
- 不得把未验证、失败或超出范围的工作描述为完成。
- 文档和用户文案保持中文；命令、路径、代码和专有名词按原样使用代码格式。
