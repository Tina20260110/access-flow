---

description: "AccessFlow MVP 可执行实施任务"
---

# Tasks：AccessFlow MVP

**输入**：`specs/001-access-request-mvp/` 下已确认的 specification、technical plan、data model、contracts、
research、quickstart 与项目 Constitution。

**测试要求**：测试按业务风险随能力一起交付；纯领域逻辑先写失败测试，再实现。E2E 只覆盖真实浏览器闭环、
IndexedDB 持久化和并发冲突，不以覆盖率数字为目标。

**组织方式**：Phase 1/2 建立所有用户故事共享的工程、领域与数据访问基础；Phase 3～6 严格对应 spec.md 的
US1～US4。任何 UI 不得绕过 `AccessFlowGateway` 或复制领域规则。

## 格式：`[ID] [P?] [Story?] 描述`

- **[P]**：前置任务完成后，可与同阶段其他 `[P]` 任务并行，且不修改同一文件。
- **[US1]～[US4]**：对应 spec.md 中的用户故事；Setup、Foundational 和收尾任务不加 Story 标签。
- 每项任务均给出目标文件路径，并在描述或阶段追溯中关联 FR、SC、Plan 或 Constitution。

## Phase 1：工程初始化（Shared Setup）

**目标**：得到能够启动、测试、类型检查和构建的最小 React + TypeScript 工程；此阶段不实现业务功能。

- [X] T001 按 plan 的固定技术栈初始化 Vite React TypeScript 单包工程，安装 React Router 7、TanStack Query、React Hook Form、Zod、idb、Tailwind、Vitest/RTL 与 Playwright，预置 dev/build/typecheck/lint/test/test:e2e scripts，并建立 `package.json`、`package-lock.json`、`index.html`、`src/main.tsx`（Plan：技术上下文与关键技术决策）
- [X] T002 [P] 开启 TypeScript strict、无类型逃逸的编译检查和 Vite 模板 ESLint 基线，配置 `tsconfig.json`、`eslint.config.js`（Constitution I、VII）
- [X] T003 [P] 配置 Vite React 与 Tailwind 4 插件、中文页面基础样式和清晰的 `:focus-visible`，完成 `vite.config.ts`、`src/index.css`（Plan：样式与无障碍）
- [X] T004 [P] 配置 Vitest/jsdom/RTL/user-event/jest-dom 与 Chromium Playwright，完成 `vitest.config.ts`、`playwright.config.ts`、`src/test/setup.ts`（Constitution VI；Plan：测试策略）

**Checkpoint**：`npm run dev` 能打开空应用，`npm run typecheck`、`npm run lint`、空测试命令和 production build 可执行。

---

## Phase 2：领域与数据访问基础（Blocking Prerequisites）

**目标**：在任何业务 UI 之前完成可信领域模型、纯规则、URL parser、Gateway contract、测试 adapter、
IndexedDB 持久化、Demo 身份基础设施和应用壳。

**关键门禁**：`DemoUser` 只能包含员工基础身份；不得出现永久 Requester/Approver/Admin/RBAC 字段。
Requester/Approver 只由单条申请的 `requesterId`/`approverId` 派生，且二者必须不同。

- [X] T005 建立 branded IDs、`DemoUser`、`Resource`、`Permission`、`AccessRequest` 状态判别联合、commands/page types 与稳定领域错误码，完成 `src/domain/models.ts`、`src/domain/errors.ts`；明确无 `roles`，并编码 `requesterId !== approverId`（FR-001、FR-003、FR-013～FR-021、FR-030）
- [X] T006 [P] 先为 branded 值、日期、`DemoUser`、资源目录、三种申请联合、审批记录和 `PersistedDemoState` 编写失败的 Zod 边界测试，覆盖未知 schemaVersion、损坏引用、非法状态、自审批和候选员工不足，写入 `src/domain/schemas.test.ts`（FR-001、FR-003、FR-014、FR-017～FR-021、FR-028～FR-030）
- [X] T007 [P] 先为资源权限精确风险映射和 `approverCandidateIds` 顺序分配编写失败的纯逻辑测试，覆盖未映射组合、跳过申请人及无合格候选员工，写入 `src/domain/request-rules.test.ts`（FR-014、FR-015、FR-030）
- [X] T008 [P] 先为共享纯函数 `canDecideRequest`/`canApproveRequest` 及 `Pending → Approved/Rejected` 状态转换编写失败测试，覆盖 Pending、负责人关系、禁止自审批、到期只能拒绝、空白拒绝原因、终态重复处理和 stale revision，并验证 transition 复用同一资格规则，写入 `src/domain/request-transitions.test.ts`（FR-018～FR-021、FR-029；SC-005）
- [X] T009 [P] 先为 `q/status/risk/page` 的 Zod 解析、规范序列化、默认值省略、坏参数独立回退、查询变化重置 page 编写失败测试；必须覆盖合法重复参数采用第一个值、第一个值无效但后续值合法时仍按 invalid fallback、以及 parse → canonical serialize 的确定性结果，写入 `src/features/request-list/list-query-state.test.ts`（FR-005～FR-008、FR-027；SC-004）
- [X] T010 实现外部数据进入可信领域层所需的完整 Zod schema、品牌值解析和根级关系校验，使 T006 通过，完成 `src/domain/schemas.ts`（Constitution I；FR-001、FR-003、FR-014、FR-017～FR-021、FR-028～FR-030）
- [X] T011 实现风险查找和审批候选分配纯函数，使 T007 通过，完成 `src/domain/request-rules.ts`；风险和 `approverId` 均不得由 UI 提供默认值（FR-014、FR-015、FR-030）
- [X] T012 实现共享纯函数 `canDecideRequest`/`canApproveRequest`，并让只接受合法判别联合与 `expectedRevision` 的批准/拒绝状态转换复用这些资格规则，使 T008 通过，完成 `src/domain/request-transitions.ts`（FR-018～FR-021、FR-029；SC-005）
- [X] T013 实现无 React 依赖的 `parseListQuery`、`serializeListQuery` 和查询更新 helpers；重复单值参数必须取第一个并通过 replace 规范化为单值，第一个值无效时不得改用后续值，使 T009 通过，完成 `src/features/request-list/list-query-state.ts`（FR-005～FR-008、FR-027；SC-004）
- [X] T014 按数据访问契约定义异步 `AccessFlowGateway`、显式 actor/viewer 输入、查询详情/摘要返回类型与 cache-neutral 错误语义，完成 `src/data/access-flow-gateway.ts`（FR-002、FR-013、FR-016～FR-021、FR-028～FR-030）
- [X] T015 [P] 先为确定性 seed 编写失败测试，验证三种状态/风险、有效引用、每个资源至少两名不同候选员工、无永久角色和 `requesterId !== approverId`，写入 `src/data/seed-data.test.ts`（FR-001、FR-003、FR-014、FR-028、FR-030）
- [X] T016 [P] 先为当前 Demo 用户 ID 偏好边界编写失败测试，覆盖合法恢复、未知 ID 回退、损坏 localStorage 和重置默认身份，写入 `src/data/demo-preferences.test.ts`（FR-001、FR-028）
- [X] T017 [P] 实现经 schema 校验的 `createSeedState(today)` 和默认员工 ID，使 T015 通过，完成 `src/data/seed-data.ts`；不得创建 Admin、RBAC 或仅能自审批的资源分配（FR-001、FR-028、FR-030）
- [X] T018 [P] 实现仅持久化并校验 `currentDemoUserId` 的小型偏好 adapter，使 T016 通过，完成 `src/data/demo-preferences.ts`（Plan：唯一 global client state；FR-001、FR-028）
- [X] T019 以 contract-first 方式编写可复用 Gateway 行为测试，覆盖目录、关系可见并集、稳定搜索/筛选/分页、详情防泄露、创建、批准、拒绝、冲突、失败不留部分写入和重置，完成 `src/test/gateway-contract.ts`、`src/test/memory-gateway.test.ts`（FR-002～FR-021、FR-028～FR-030）
- [X] T020 [P] 实现供 unit/integration tests 注入的内存 Gateway，使 T019 的完整契约测试通过，完成 `src/test/memory-gateway.ts`（Plan：测试 adapter；FR-002～FR-021、FR-028～FR-030）
- [X] T021 [P] 实现单 `demo-state` store、单 versioned document 的 IndexedDB Gateway，所有读取/返回均经 Zod 校验；创建与审批在 `readwrite` 事务中基于最新记录验证 revision，并调用 T012 的共享领域资格与转换规则，完成 `src/data/indexed-db-gateway.ts`（FR-013、FR-018～FR-021、FR-028～FR-030；SC-005、SC-009）
- [X] T022 实现固定人工延迟、测试环境可配置零延迟和确定性下一次失败的 Gateway decorator，并验证延迟与故障均发生在 IndexedDB 事务之外且失败不改变数据，完成 `src/data/demo-transport.ts`、`src/data/demo-transport.test.ts`（FR-012、FR-021、FR-023、FR-024）
- [ ] T023 [P] 先为根级 providers 与 Demo 身份行为编写集成测试，覆盖 current ID 派生、身份切换、未知偏好回退、无永久角色门禁以及切换后 viewer query 变化，写入 `src/features/demo-identity/demo-identity.test.tsx`（FR-001、FR-002、FR-028）
- [ ] T024 建立 QueryClient/Gateway 注入，为所有基于本地 `AccessFlowGateway` 的 query/mutation 配置 `networkMode: 'always'`，为 Demo Users query 配置较长 `staleTime`，并明确 Query cache 不作为持久化事实来源；实现仅保存 current user ID 的 DemoIdentity Context、身份切换器、AppShell、路由骨架与中文 NotFound，使 T023 通过，完成 `src/app/providers.tsx`、`src/features/demo-identity/DemoIdentityProvider.tsx`、`src/features/demo-identity/DemoUserSwitcher.tsx`、`src/app/AppShell.tsx`、`src/app/router.tsx`、`src/pages/NotFoundPage.tsx`、`src/main.tsx`（FR-001、FR-002、FR-023～FR-026、FR-028）

**Checkpoint**：全部纯逻辑与 memory Gateway contract tests 通过；浏览器首次打开可校验 seed、初始化 IndexedDB、
切换员工身份。此后任何用户故事 UI 只能依赖 Gateway/query hooks。

---

## Phase 3：用户故事 1——创建权限申请（Priority：P1）🎯 首个可演示增量

**目标**：任一 Demo 员工都能提交有效申请，获得由资源规则确定的风险和 `approverId`，并看到持久化的
`Pending` 结果；无效或失败提交不会产生数据。

**追溯**：US1；FR-010～FR-015、FR-023～FR-026、FR-028、FR-030；SC-002、SC-006、SC-009。

**独立测试**：用任一员工填写有效资源、权限、未来截止日期和原因后提交；验证进行中防重复、成功导航到新
申请、`Pending`/风险/负责审批人正确，刷新后仍存在。分别验证空字段、空白原因、无映射、无候选与瞬时失败重试。

- [ ] T025 [P] [US1] 先为创建表单 schema 编写单元测试，覆盖全部必填、trim、真实日期、截止日期晚于提交日和 command 类型输出，写入 `src/features/request-create/create-request.schema.test.ts`（FR-010、FR-011、FR-015、FR-030）
- [ ] T026 [P] [US1] 先编写创建页面集成测试，覆盖任一员工在不离开创建页面配置额外信息的连续表单流程、目录四态、字段错误关联、提交 pending/防重复、失败保值与重试、成功立即导航详情并确认 `Pending`，以及 risk/approver 由 Gateway 返回，写入 `src/features/request-create/create-request.test.tsx`（FR-010～FR-015、FR-023～FR-026、FR-030；SC-002、SC-006）
- [ ] T027 [P] [US1] 实现 React Hook Form 使用的 Zod 创建 schema，使 T025 通过，完成 `src/features/request-create/create-request.schema.ts`（FR-010、FR-011）
- [ ] T028 [P] [US1] 实现使用较长 `staleTime` 的 Resource Catalog query、创建 mutation、成功详情缓存填充与列表失效，并提供新申请详情的初始 query hook；沿用 T024 的 `networkMode: 'always'` 且不得把 Query cache 当作持久化来源，完成 `src/features/request-create/create-request.queries.ts`、`src/features/request-detail/request-detail.queries.ts`（FR-012、FR-013、FR-023、FR-024、FR-028）
- [ ] T029 [US1] 实现具有真实 label、错误关联、首错聚焦、提交状态和保值重试的创建表单，使 T026 的交互断言通过，完成 `src/features/request-create/CreateRequestForm.tsx`（FR-010～FR-012、FR-023～FR-026）
- [ ] T030 [US1] 组装无需离开页面执行额外配置的 `/requests/new` 连续表单流程，并在成功后立即导航 `/requests/:requestId`，直接显示可刷新恢复的 `Pending` 确认信息，完成 `src/pages/CreateRequestPage.tsx`、`src/pages/RequestDetailPage.tsx`、`src/features/request-detail/RequestDetails.tsx`、`src/app/router.tsx`（FR-013、FR-016、FR-023～FR-026、FR-028；SC-002、SC-009）

**Checkpoint**：US1 可独立演示和验证；用户无需列表或审批即可创建并重新打开一条有效 Pending 申请。

---

## Phase 4：用户故事 2——查找和浏览权限申请（Priority：P1）

**目标**：员工看到自己提交与分配给自己的申请并集，并用可恢复 URL 完成搜索、组合筛选和分页。

**追溯**：US2；FR-002、FR-004、FR-005、FR-006、FR-007、FR-008、FR-009、FR-022～FR-028；
SC-003、SC-004、SC-006、SC-007。

**独立测试**：从包含不同申请人、资源、状态与风险的 seed 进入 `/requests`，验证关系可见并集、搜索/筛选/
分页、两类 Empty、错误重试、身份切换、刷新/前进后退/复制 URL 恢复及无效参数规范化。

- [ ] T031 [P] [US2] 为 Gateway 列表语义增加针对关系并集去重、名称部分匹配、组合筛选、稳定排序、固定分页与越界页回退的集成测试，写入 `src/features/request-list/request-list.gateway.test.ts`（FR-002、FR-004～FR-009）
- [ ] T032 [P] [US2] 先编写列表页面集成测试，覆盖 URL 重挂载/前进后退、搜索或筛选重置 page、身份切换、更新时保留结果、两类 Empty、错误重试、语义 table/nav 和 High Risk 非颜色提示，写入 `src/features/request-list/request-list.test.tsx`（FR-002、FR-004～FR-009、FR-022～FR-027；SC-004、SC-006、SC-007）
- [ ] T033 [P] [US2] 实现包含 viewerId 与规范 query 的稳定 query key、短 staleTime、一次 transient retry 和保留前页结果的列表 query hook，完成 `src/features/request-list/request-list.queries.ts`（FR-002、FR-023、FR-024）
- [ ] T034 [P] [US2] 实现搜索草稿提交、状态/风险筛选、分页控件、语义表格及文字化风险/状态提示，完成 `src/features/request-list/RequestFilters.tsx`、`src/features/request-list/RequestTable.tsx`、`src/components/RiskBadge.tsx`、`src/components/StatusBadge.tsx`（FR-004～FR-007、FR-022、FR-025、FR-026）
- [ ] T035 [US2] 组装 `/requests` 页面，以 URL 为已提交查询唯一来源，处理规范 replace/history、越界页、Loading/Empty/Error/Success 和身份切换后的重新查询，使 T031/T032 通过，完成 `src/pages/RequestListPage.tsx`、`src/app/router.tsx`（FR-002、FR-005～FR-009、FR-023～FR-028；SC-004、SC-006）
- [ ] T036 [US2] 使用至少 1,000 条 fixture 添加 jsdom 代表性规模正确性测试，验证搜索、组合筛选、稳定排序和分页行为并发现明显算法问题；不得以 jsdom 墙钟时间作为 SC-003 的正式 2 秒验收，完成 `src/features/request-list/request-list.scale.test.tsx`、`src/test/fixtures.ts`（FR-005～FR-007；SC-003 的正式验收见 T052；Constitution VIII）

**Checkpoint**：US2 可仅依靠 seed 独立验证，复制任何规范列表 URL 都能恢复相同查询含义。

---

## Phase 5：用户故事 3——查看申请详情（Priority：P1）

**目标**：申请关系参与者可直接打开并刷新详情，看到全部业务字段和审批记录；不存在与不可见不泄露差异。

**追溯**：US3；FR-016、FR-017、FR-022～FR-026、FR-028；SC-006～SC-009。

**独立测试**：分别以 requester、approver 和无关员工直达同一 requestId；前两者看到完整信息并可刷新恢复，
无关员工与未知 ID 得到相同不可用反馈；再验证 High Risk、暂无记录、终态记录和加载失败重试。

- [ ] T037 [P] [US3] 为 Gateway 详情查询补充 requester/approver 可见、无关员工与未知 ID 同为 `NOT_FOUND`、Pending/Approved/Rejected 详情形状的集成测试，写入 `src/features/request-detail/request-detail.gateway.test.ts`（FR-016、FR-017、FR-028）
- [ ] T038 [P] [US3] 先编写详情页面集成测试，覆盖直达/重挂载、四态、全部字段、暂无审批记录、批准/拒绝记录、直接可见的状态与风险、无需展开即可识别的当前下一步、High Risk/最终状态/关键下一步的非颜色表达、重试和标题焦点，写入 `src/features/request-detail/request-detail.test.tsx`（FR-016、FR-017、FR-022～FR-026；SC-006～SC-008）
- [ ] T039 [P] [US3] 创建或完善详情 query key、viewer 隔离、短 staleTime、窗口聚焦刷新和不可见错误映射，完成 `src/features/request-detail/request-detail.queries.ts`（FR-016、FR-023、FR-024、FR-028）
- [ ] T040 [P] [US3] 完整实现申请人、负责审批人、资源、权限、期限、原因、直接可见的风险与状态、时间和审批记录的语义化展示；核心状态不得藏在折叠区域，创建或完善 `src/features/request-detail/RequestDetails.tsx`（FR-016、FR-017、FR-022、FR-026；SC-008）
- [ ] T041 [US3] 完成详情页 Loading/不可用/Error/Success、重试、直达刷新和导航后焦点管理，使 T037/T038 通过，创建或完善 `src/pages/RequestDetailPage.tsx`、`src/app/router.tsx`（FR-016、FR-023～FR-026、FR-028；SC-006～SC-009）

**Checkpoint**：US3 可对 seed 中任意状态独立验证，详情 URL 刷新后保持同一申请且不会泄露不可见记录。

---

## Phase 6：用户故事 4——批准或拒绝权限申请（Priority：P1）

**目标**：只有 `actorId === request.approverId` 且不是 requester 的员工可处理 Pending；首个有效决定形成唯一
终态与审批记录，拒绝必须有原因，过期申请不可批准但可拒绝。

**追溯**：US4；FR-018、FR-019、FR-020、FR-021、FR-023～FR-026、FR-028、FR-029；
SC-001、SC-005～SC-009。

**独立测试**：准备两条 Pending，负责审批人分别批准和带原因拒绝；验证申请人/无关员工/自审批均无操作权、
空白原因失败、过期批准失败、重复点击受控、瞬时失败可重试、两个 stale revision 只有首个成功。

- [ ] T042 [P] [US4] 先为拒绝表单 Zod schema 编写单元测试，覆盖 trim 后非空、错误消息和 command 输出，写入 `src/features/request-detail/reject-request.schema.test.ts`（FR-020、FR-026）
- [ ] T043 [P] [US4] 先编写审批集成测试，覆盖关系资格、批准、拒绝必填、过期批准、终态隐藏操作、重复点击、transient 重试、stale conflict 重取与焦点提示，写入 `src/features/request-detail/approval-flow.test.tsx`（FR-018～FR-021、FR-023～FR-026、FR-029；SC-005、SC-006）
- [ ] T044 [P] [US4] 实现拒绝表单 schema，使 T042 通过，完成 `src/features/request-detail/reject-request.schema.ts`（FR-020）
- [ ] T045 [P] [US4] 实现保守 approve/reject mutations：command 必须携带 `expectedRevision`，不自动重试、不 optimistic update；当前页面成功后更新详情并失效列表，收到 `CONFLICT` 后主动 refetch 最新详情和列表，完成 `src/features/request-detail/request-detail.queries.ts`（FR-018～FR-021、FR-023、FR-024、FR-029）
- [ ] T046 [US4] 实现直接展示当前关键下一步的审批面板和可键盘关闭/恢复焦点的拒绝对话框；`ApprovalPanel` 只能调用 T012 的共享 domain capability predicates 决定操作显示或启用，不得复制 Pending、负责人、禁止自审批或期限判断，也不得读取永久角色，Gateway/transition 仍负责最终校验，完成 `src/features/request-detail/ApprovalPanel.tsx`、`src/features/request-detail/RejectDialog.tsx`（FR-018、FR-020、FR-021、FR-025、FR-026、FR-029；SC-008）
- [ ] T047 [US4] 将审批区接入详情页，处理 mutation pending、成功播报、失败保值重试、过期提示和 conflict 聚焦，使 T043 通过，扩展 `src/pages/RequestDetailPage.tsx`（FR-018～FR-021、FR-023～FR-026、FR-029；SC-005、SC-006）

**Checkpoint**：US4 独立通过批准与拒绝验收；业务闭环 US1→US2→US3→US4 已完整，终态不能被第二次决定覆盖。

---

## Phase 7：收尾与跨故事质量门禁（Polish & Cross-Cutting）

**目标**：验证真实 IndexedDB、身份切换、URL、并发、键盘流程和生产构建；只修复验收发现的问题，不扩展范围。

- [ ] T048 为 AppShell 增加二次确认的“重置 Demo 数据”，成功后清领域 cache、恢复默认员工并导航列表，失败保持原数据；补集成测试，完成 `src/app/AppShell.tsx`、`src/app/app-shell.test.tsx`（Plan：重置 Demo 数据；FR-023、FR-024、FR-028）
- [ ] T049 编写并运行 Chromium 核心闭环 E2E：不使用开发者工具、手工修改持久化数据或页面外操作，仅通过 UI 完成重置→员工连续表单创建→列表查找→查看详情→切换到 `approverId` 员工批准→切回 `requesterId` 员工查看最终结果，并直接核对状态、风险和当前下一步，同时覆盖纯键盘主路径，完成 `e2e/access-flow.spec.ts`（US1～US4；SC-001、SC-002、SC-004、SC-005、SC-007～SC-009）
- [ ] T050 编写并运行浏览器持久化/冲突 E2E，复用 T019 的核心 Gateway 契约向量验证生产 IndexedDB adapter：两个页面持有同一 Pending revision，首个决定成功，第二个使用 stale `expectedRevision` 提交后收到 `CONFLICT`，主动 refetch 详情和列表并恢复相同终态；重开与重置仍保持契约一致，完成 `e2e/approval-conflict.spec.ts`（FR-021、FR-028；SC-005、SC-009）
- [ ] T051 按 quickstart 完成键盘、label、焦点、错误关联、live region、对话框 Escape/焦点恢复，以及列表/详情直接展示状态与风险、详情无需展开即可识别下一步、High Risk/最终状态/关键下一步非颜色表达的检查，并修复发现的问题，涉及 `src/index.css`、`src/components/RiskBadge.tsx`、`src/components/StatusBadge.tsx`、`src/features/request-create/CreateRequestForm.tsx`、`src/features/request-detail/RequestDetails.tsx`、`src/features/request-detail/ApprovalPanel.tsx`、`src/features/request-detail/RejectDialog.tsx`（FR-022、FR-025、FR-026；SC-007、SC-008）
- [ ] T052 按 `specs/001-access-request-mvp/quickstart.md` 完成四组手工验收与重开持久化，并正式验证 SC-003：在 Chromium + production preview 中准备至少 1,000 条当前员工可见申请，对文本搜索、状态筛选、风险筛选、组合筛选和翻页各执行 20 次，测量从提交操作到新结果或明确状态可见，汇总样本计算 P95 且必须 ≤ 2 秒，首次应用启动时间不计入；仅在有该真实浏览器测量证据时修复 `src/features/request-list/request-list.queries.ts`、`src/pages/RequestListPage.tsx`（SC-003、SC-006、SC-008、SC-009；Constitution VIII）
- [ ] T053 运行 `npm run lint` 并修复全部问题，不使用禁用规则绕过，检查 `eslint.config.js`、`src/`、`e2e/`（Constitution I、II、VII）
- [ ] T054 运行 `npm run typecheck` 并修复全部 strict 错误，确认业务代码无显式 `any`、双重断言或关闭检查，检查 `tsconfig.json`、`src/`、`e2e/`（Constitution I）
- [ ] T055 运行 `npm run test`，确保全部 domain、schema、Gateway 与 RTL 测试通过且无仅为覆盖率存在的断言，检查 `vitest.config.ts`、`src/domain/`、`src/data/`、`src/features/`、`src/test/`（Constitution VI；SC-004～SC-007）
- [ ] T056 运行 `npm run build` 验证 production build，再使用 `npm run preview` 验证应用内导航和具备 history fallback 的 production preview 中 `/requests/:requestId` 路由行为；不要求 `dist/` 自行处理服务器 fallback，并在 `specs/001-access-request-mvp/quickstart.md` 明确静态托管必须将 `/requests/:requestId` 等未知服务器路径 fallback 到 `index.html`，检查 `vite.config.ts`、`src/app/router.tsx`、`dist/`（FR-016、FR-028；Plan：目标平台）

**最终门禁**：T049～T056 全部通过后，AccessFlow MVP 才可视为实现完成。

---

## 依赖与执行顺序

### 阶段依赖

- Phase 1 无前置依赖；T001 完成后，T002～T004 可并行。
- Phase 2 依赖 Phase 1，并阻塞所有用户故事 UI。
- Phase 3～5 均可在 Phase 2 后基于 seed 独立启动；为减少同一文件冲突，单人实施按 US1→US2→US3 执行。
- Phase 6 的审批 UI 嵌入详情页，因此依赖 Phase 5；其领域转换和 Gateway 已在 Phase 2 完成。
- Phase 7 依赖目标用户故事全部完成；质量门禁按 T048→T049/T050→T051→T052→T053→T054→T055→T056 执行。

### Foundational 内部依赖

```text
T005
 ├─ T006 → T010
 ├─ T007 → T011 ─┐
 ├─ T008 ────────┴→ T012
 └─ T009 → T013

T010 + T011 + T012 + T013 → T014
T015 → T017 ─┐
T016 → T018  │
T014 + T017 → T019 → T020
T014 + T010 + T011 + T012 + T017 → T021
T020 + T021 → T022
T018 + T020 + T022 → T023 → T024
```

### 用户故事依赖

- **US1 创建申请**：依赖 Phase 2；通过 seed、Gateway 和最小详情确认可独立验证。
- **US2 列表查询**：依赖 Phase 2，不依赖 US1；可用 seed 独立验证。顺序实施时放在 US1 后形成“创建后查找”。
- **US3 详情查看**：依赖 Phase 2，不依赖 US1/US2；可直接使用 seed requestId。顺序实施时复用 US1 的最小详情页。
- **US4 审批申请**：依赖 US3 的完整详情 UI；批准/拒绝领域能力本身只依赖 Phase 2。

### 每个用户故事内部顺序

- 先完成该故事的 test tasks，并确认它们因缺少行为而失败。
- 再实现 schema/query hooks 与 feature components。
- 最后由 page 组装四态、导航、焦点和反馈，并运行该阶段所有测试。
- 一个故事的 Checkpoint 未通过时，不进入顺序交付中的下一故事。

## 并行执行示例

### US1

```text
并行：T025 创建 schema 单元测试；T026 创建页面集成测试
并行：T027 创建 schema 实现；T028 Query hooks
串行：T029 → T030
```

### US2

```text
并行：T031 Gateway 列表语义测试；T032 列表页面集成测试
并行：T033 列表 Query hooks；T034 筛选、表格和提示组件
串行：T035 → T036
```

### US3

```text
并行：T037 Gateway 详情可见性测试；T038 详情页面集成测试
并行：T039 Query 完善；T040 纯展示组件
串行：T041 汇总页面四态与焦点
```

### US4

```text
并行：T042 拒绝 schema 测试；T043 审批流程集成测试
并行：T044 拒绝 schema；T045 审批 mutations
串行：T046 → T047
```

## 实施策略

### 首个可演示增量

1. 完成 Phase 1：工程可运行、可测试、可构建。
2. 完成 Phase 2：领域与 Gateway 门禁通过。
3. 完成 Phase 3：任一员工能创建并刷新恢复 Pending 申请。
4. 停止并独立验证 US1；这是首个可演示增量，但不是完整 AccessFlow MVP 闭环。

### 完整 MVP 增量交付

1. US1：创建并持久化申请。
2. US2：通过关系可见范围和 URL 查询找到申请。
3. US3：直接访问并核对详情。
4. US4：负责审批人批准或拒绝并形成唯一终态。
5. Phase 7：真实浏览器闭环、无障碍和全部质量门禁通过。

完整 AccessFlow MVP 必须包含 US1～US4；不得以只完成 US1 代替产品成功标准中的端到端闭环。

## 实施约束

- 不新增 Zustand、MSW、Axios、UI Library、通用 repository 基类或未在 plan 中出现的架构层。
- `DemoUser` 不得添加角色字段；UI 只能把当前员工 ID 与申请传给共享 domain capability predicates，
  不得自行比较 `requesterId`/`approverId` 或复制审批资格规则。
- 资源通过 `approverCandidateIds` 确定 `approverId`，任何路径都必须保持 `requesterId !== approverId`。
- UI 不直接读写 IndexedDB/localStorage；业务数据只经 Gateway，身份偏好只经专用 adapter。
- 每项实现任务完成时运行其对应的最小测试集；Phase 7 再运行全量门禁。
