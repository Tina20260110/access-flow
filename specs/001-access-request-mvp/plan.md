# AccessFlow MVP 实施计划

**分支**：`001-access-request-mvp` | **日期**：2026-08-31 | **规格**：[spec.md](spec.md)

**输入**：已完成 clarify 的 AccessFlow MVP specification。

## 摘要

构建一个纯前端 React SPA，完成权限申请列表、创建、详情、单级批准/拒绝、Demo 身份切换、URL 查询恢复和
同一浏览器持久化闭环。React Router 只管理路由和 URL state；TanStack Query 管理所有 server state；
React Context 只保存当前 Demo 用户 ID；IndexedDB 通过统一 `AccessFlowGateway` 模拟异步服务端，并用事务和
申请 revision 保证审批冲突只接受首个决定。`DemoUser` 仅表示员工基础身份，Requester/Approver 由每条申请的
`requesterId`/`approverId` 派生。领域类型、Zod 边界和风险分层测试共同约束非法业务状态。

## 技术上下文

**语言/版本**：Node.js `22.22+`；TypeScript `6.0.x` strict；React `19.2.x`

**主要依赖**：Vite `8.x`、React Router `8.x` Declarative Mode、TanStack Query `5.x`、Tailwind CSS
`4.x`、React Hook Form `7.x`、`@hookform/resolvers` `5.x`、Zod `4.x`、`idb` `8.x`

**存储**：IndexedDB 单 object store、单 versioned document 保存业务数据；小型 `localStorage` 偏好 adapter
只保存并校验 `currentDemoUserId`；TanStack Query cache 不作为持久化来源

**测试**：Vitest `4.x`、jsdom、React Testing Library、user-event、jest-dom、Playwright Test 稳定 `1.x`

**目标平台**：当前主流桌面浏览器中的客户端 SPA；Tailwind 4 所需现代 CSS 基线；静态托管需 SPA fallback

**项目类型**：单包、纯前端 Web 应用；无真实后端、认证服务或第三方企业集成

**性能目标**：至少 1,000 条可见申请时，搜索、筛选和翻页交互的汇总样本 P95 不超过 2 秒；不设未经测量的
额外微性能指标

**约束**：3～5 天完成；严格类型安全；业务数据跨刷新和重开持续；URL 可恢复；审批 mutation 不可重复且必须
处理 stale revision；核心流程键盘可完成；所有文档和用户文案使用中文

**规模/范围**：3 个业务路由、2 类申请关系、3 个审批状态、3 个风险等级、1 个创建表单、1 个审批面板、
1～2 条 E2E；不实现 Admin、RBAC、多级审批、组织架构、通知、国际化或移动端专用应用

## 宪章检查

*门禁：Phase 0 研究前必须通过，并在 Phase 1 设计后复查。*

| 宪章要求 | Phase 0 前 | Phase 1 后 | 设计证据 |
|---|---|---|---|
| 严格类型安全 | 通过 | 通过 | TypeScript strict；无 `any`；Zod 校验持久化、URL、表单与 gateway 边界；申请使用判别联合 |
| 清晰组件与模块职责 | 通过 | 通过 | pages 只编排；domain 纯业务；data 隔离存储；features 承担用例组件与 query hooks |
| 状态归属与生命周期 | 通过 | 通过 | Query 管 server state，URL 管查询，局部组件管交互，Context 仅管 current user ID；无 Zustand |
| 完整可恢复体验 | 通过 | 通过 | 路由契约覆盖 URL 恢复；每个异步界面定义 loading/empty/error/success 与重试 |
| 无障碍 | 通过 | 通过 | 语义 HTML、label、键盘、焦点、错误关联、live region、高风险非颜色表达均有验收 |
| 面向行为测试 | 通过 | 通过 | 纯规则 unit、页面 integration、1～2 条关键 E2E；无覆盖率数字目标 |
| 简单代码与依赖克制 | 通过 | 通过 | 单 SPA、单 gateway、单文档 IndexedDB；`idb` 有事务价值；拒绝 Zustand/MSW/UI Library |
| 基于测量的性能治理 | 通过 | 通过 | 普通分页与稳定 query key；只做去重和合理缓存；不采用虚拟列表或复杂 memoization |
| 规格驱动开发 | 通过 | 通过 | plan、research、data model、contracts 和 quickstart 均追溯当前 spec；tasks 后续生成 |
| 中文工作语言 | 通过 | 通过 | 本功能所有设计产物使用中文，必要技术名词保留原文并提供中文解释 |

**门禁结论**：通过。没有需要记录到 Complexity Tracking 的宪章例外或违规。

## 项目结构

### 本功能文档

```text
specs/001-access-request-mvp/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── data-access.md
│   └── routes.md
├── checklists/
│   └── requirements.md
└── tasks.md                 # 后续由 $speckit-tasks 生成
```

### 源代码

```text
package.json
package-lock.json
eslint.config.js
playwright.config.ts
tsconfig.json
vite.config.ts
vitest.config.ts

src/
├── app/
│   ├── AppShell.tsx
│   ├── providers.tsx
│   └── router.tsx
├── pages/
│   ├── RequestListPage.tsx
│   ├── CreateRequestPage.tsx
│   ├── RequestDetailPage.tsx
│   └── NotFoundPage.tsx
├── domain/
│   ├── models.ts
│   ├── schemas.ts
│   ├── request-rules.ts
│   ├── request-transitions.ts
│   └── errors.ts
├── data/
│   ├── access-flow-gateway.ts
│   ├── indexed-db-gateway.ts
│   ├── demo-transport.ts
│   ├── seed-data.ts
│   └── demo-preferences.ts
├── features/
│   ├── demo-identity/
│   │   ├── DemoIdentityProvider.tsx
│   │   └── DemoUserSwitcher.tsx
│   ├── request-list/
│   │   ├── list-query-state.ts
│   │   ├── request-list.queries.ts
│   │   ├── RequestFilters.tsx
│   │   └── RequestTable.tsx
│   ├── request-create/
│   │   ├── create-request.schema.ts
│   │   ├── create-request.queries.ts
│   │   └── CreateRequestForm.tsx
│   └── request-detail/
│       ├── request-detail.queries.ts
│       ├── RequestDetails.tsx
│       ├── ApprovalPanel.tsx
│       └── RejectDialog.tsx
├── components/
│   ├── Button.tsx
│   ├── FormField.tsx
│   ├── FeedbackPanel.tsx
│   ├── RiskBadge.tsx
│   └── StatusBadge.tsx
├── test/
│   ├── render.tsx
│   ├── fixtures.ts
│   └── memory-gateway.ts
├── main.tsx
└── index.css

e2e/
├── access-flow.spec.ts
└── approval-conflict.spec.ts
```

**结构决策**：采用单 Vite 应用。`domain` 不依赖 React、Router、Query 或持久化；`data` 实现异步业务契约；
`features` 按当前三个用例组织组件、schema 与 query hooks；`pages` 只连接路由参数和 feature；`components`
只接收已经出现至少两次且语义一致的基础控件。禁止新增笼统的 `shared/utils`、通用 repository 基类或未来模块。

## 总体架构与依赖方向

```text
pages / feature components
          │
          ├── URL state ── React Router
          ├── local UI state ── React Hook Form / useState
          └── server state ── TanStack Query
                                  │
                           AccessFlowGateway
                                  │
                    domain rules + Zod boundaries
                                  │
                         IndexedDB (single document)
```

依赖只能向下。domain 不读取当前 React Context；query hooks 把 `currentUserId` 作为显式 viewer/actor 参数传给
gateway；持久化 adapter 不返回未经校验的原始数据。

## 状态归属

| 状态 | 唯一所有者 | 生命周期与规则 |
|---|---|---|
| Demo Users、资源目录 | TanStack Query + gateway | server state；静态目录 query 使用长 staleTime |
| 申请列表、详情 | TanStack Query + gateway | server state；query key 包含 viewer 与规范查询/申请 ID |
| 创建、批准、拒绝及结果 | TanStack Query mutation | 保守更新；成功后更新详情并失效列表；mutation 不自动重试 |
| 搜索、状态、风险、页码 | URL | 已提交查询的唯一来源；search/filter 改变时 page 重置为 1 |
| 搜索草稿、拒绝原因、dialog 开关 | 最近的 feature component | 当前交互；关闭或离开后销毁 |
| 当前 Demo 用户 ID | App 根级 React Context | 唯一 global client state；经 `localStorage` 偏好 adapter 校验并恢复 |
| 当前 Demo 用户对象、风险、审批资格 | 派生值 | 从 ID、目录或共享 domain capability predicate 计算，禁止重复保存或在 UI 复制规则 |

不引入 Zustand。当前身份只有一个跨页面标量，Context 足够；完整用户仍由 Query 管理。身份切换使带 viewerId
的 query key 自然变化，并从创建/详情页返回列表，避免旧身份上下文残留。

## 路由与页面

| 路由 | 责任 |
|---|---|
| `/requests` | 单一列表；搜索、状态、风险和 page 使用 URL；当前员工看到自己提交与分配给自己的申请并集 |
| `/requests/new` | 创建申请；所有有效 Demo 员工均可用；资源权限和审批人最终由 gateway 校验 |
| `/requests/:requestId` | 可直接访问的详情；审批面板嵌入此页，不拆 Approve/Reject 路由 |

`/` replace 到 `/requests`，未知路径进入中文 NotFound。详情不存在与无权查看使用同一反馈。完整 URL 解析、
历史与规范化规则见 [contracts/routes.md](contracts/routes.md)。

## 数据访问与持久化

选择 IndexedDB + `idb`，运行时不引入 MSW：

- 单 `demo-state` store 保存 `schemaVersion: 1` 根文档；约 1,000 条数据在内存过滤/稳定排序/分页。
- 首次无数据时写入经 Zod 校验的 seed；已有损坏数据展示错误和显式重置入口，不静默覆盖。
- `AccessFlowGateway` 提供用户、资源、列表、详情、创建、批准、拒绝和重置操作，UI 不接触存储实现。
- 查询约 200ms、变更约 350ms 的固定延迟只用于展示异步状态；测试可注入零延迟或下一次确定性失败。
- 创建和审批在写事务内再次验证完整领域规则；失败不留下部分写入。
- 每条申请含 revision；审批 command 带 expectedRevision。先完成的事务写入终态并加 1，后续旧版本得到
  `CONFLICT`，重取详情和列表后展示最终状态。
- 审批不做 optimistic update；不可逆状态的短延迟不值得引入回滚复杂度。
- 重置以一个事务替换完整 seed，随后清理领域 query、恢复默认身份并进入列表。

操作、错误和 cache 失效契约见 [contracts/data-access.md](contracts/data-access.md)。

## 领域模型与校验边界

`AccessRequest` 使用判别联合，`Pending` 只能有 `approvalRecord: null`；`Approved` 必须携带批准记录；
`Rejected` 必须携带含非空原因的拒绝记录。完整字段、关系、转换和 revision 规则见
[data-model.md](data-model.md)。

`domain/request-transitions.ts` 提供共享纯 capability predicates：`canDecideRequest(request, actorId)` 统一判断
Pending、负责人关系和禁止自审批，`canApproveRequest(request, actorId, decisionDate)` 在此基础上增加截止日期
有效性。`ApprovalPanel` 只能调用这些共享 predicate 决定审批操作的显示或启用；状态转换与 Gateway 在写事务
内再次调用相同领域规则并校验 `expectedRevision`，UI 判断不构成最终业务边界。

| 边界 | Zod 校验责任 |
|---|---|
| IndexedDB 读取 | 根 schemaVersion、判别联合、ID 唯一性、引用和申请关系；失败进入可重置错误状态 |
| URL 参数 | q trim；status/risk 枚举；page 正整数；单值参数重复时取第一个；坏参数独立回退并规范化 |
| 创建表单 | 必填、非空白原因、有效资源权限组合、截止日期晚于提交日 |
| 拒绝表单 | 去除首尾空白后非空，并与字段错误关联 |
| Gateway command | 在写事务内调用共享 domain 规则校验 actor、申请关系、审批资格、截止日期、状态和 revision，不信任 UI 或复制规则 |
| Gateway 返回值 | adapter 返回前解析为可信领域联合，Query hooks 不接收 `unknown` |
| Seed | 编译期 `satisfies` 加启动时 schema/关系校验 |

品牌 ID、字符串字面量联合和 schema 推导替代宽泛 string/enum/断言；禁止显式 `any`、双重断言或关闭检查。

## 异步、错误与重试

| 流程 | Loading/Pending | Empty/不可用 | Error 与重试 | Success |
|---|---|---|---|---|
| 列表 | 首载文字 loading；更新时保留旧结果并标记正在更新 | 区分无可见申请与无匹配结果 | 保留 URL，显示摘要和重试；query 对 transient 最多自动重试 1 次 | 语义表格与分页 |
| 详情 | 主区域 `aria-busy` | 不存在/不可见统一反馈 | 保留 requestId，明确重试 | 展示全部信息和审批记录 |
| 创建 | 目录加载；提交时禁用按钮 | 无有效资源或无审批人时阻止 | 保留表单值；字段/表单错误和手动重试 | 填充新详情缓存并导航详情，播报成功 |
| 批准 | 禁用整个审批区 | 非负责人、自审批、终态或过期不显示/禁用相应操作 | mutation 不自动重试；transient 可手动重试；conflict 重取并聚焦提示 | 返回并展示唯一 Approved 终态 |
| 拒绝 | 禁用整个审批区，保留输入 | 终态不再显示操作 | 空白原因关联字段；transient 保留原因；conflict 重取 | 返回并展示唯一 Rejected 终态 |
| 重置 | 禁用确认按钮并显示处理中 | 不适用 | 原数据保持不变并允许重试 | 清缓存、恢复默认身份与 seed |

所有基于本地 `AccessFlowGateway` 的 Query query/mutation 使用 `networkMode: 'always'`。Demo Users/Resources
使用较长 `staleTime`（MVP 取 Infinity，重置时显式清除）；申请列表与详情使用较短的约 15 秒 `staleTime`，
并允许在窗口重新聚焦时刷新。创建/审批成功后按 contract 精确更新详情和失效列表；Query cache 始终只是
server state 缓存，不是业务持久化事实来源。

## 无障碍计划

- 使用原生 `button`、`a`、`input`、`select`、语义 table/nav；每个表单控件具有真实 label。
- 成组控件使用 fieldset/legend；必填和错误不只靠星号或颜色。
- 无效控件设置 `aria-invalid`，用 `aria-describedby` 关联帮助与错误；提交失败聚焦错误摘要或首个无效字段。
- 所有核心操作可键盘完成且有明显 `:focus-visible`；路由导航后聚焦页面主标题。
- 对话框打开后聚焦标题或首个输入，支持 Escape，关闭后把焦点还给触发按钮；dialog 状态留在最近组件。
- 成功与非阻塞更新使用 `role="status"`/礼貌播报；错误和审批冲突使用 `role="alert"`，冲突后聚焦提示。
- High Risk 始终显示“高风险”文字，并配合图标、边框或形状；图标只强化，不替代文本。
- RTL 通过 role、label 和 accessible name 断言；Playwright 核心闭环包含纯键盘路径。

## 测试策略

### Unit Tests

- 风险映射精确命中及未映射失败；有序审批人跳过申请人及无合格审批人失败。
- 共享审批 capability predicates 及 `Pending → Approved/Rejected` 转换，覆盖自审批、非负责人、终态重复处理、
  过期批准和 revision 冲突，并验证 transition 复用同一资格规则。
- 判别联合和根持久化 schema 拒绝非法状态、损坏引用与未知 schemaVersion。
- URL 缺失/无效/越界参数、合法重复参数、首个值无效但后续值合法、parse → canonical serialize 确定性和
  查询变化重置 page。
- 创建与拒绝表单 schema，包括纯空白和截止日期边界。

### Integration Tests

注入同一 contract 的内存 gateway，提供确定性延迟、失败和冲突：

- 列表搜索、组合筛选、分页、空状态、URL 重挂载与前进后退。
- Demo 身份切换后的关系可见并集、任意员工创建能力与单条申请审批资格。
- 创建提交 pending、重复点击、失败保值、重试和成功导航。
- Approve、Reject 必填、终态不可重审、stale conflict、错误与重试。
- loading/empty/error/success、label/错误关联/live region/关键焦点迁移。

### Playwright E2E

1. 核心批准闭环：不使用开发者工具、手工修改持久化数据或页面外操作，仅通过 UI 完成重置 → 员工创建申请 →
   查找申请 → 查看详情 → 切换到该申请的 `approverId` 员工 → 批准 → 切回该申请的 `requesterId` 员工查看
   最终结果，并直接核对状态、风险和当前下一步。
2. 高风险持久化/冲突场景：两个页面持有同一 Pending revision，首个决定成功，第二个显示冲突并恢复相同终态。

Reject 分支和错误注入留在 integration tests。默认只跑 Chromium；不设置覆盖率门槛，不扩展三浏览器矩阵。

## 性能计划

- TanStack Query 负责相同 query key 去重，所有 key 使用规范化、可序列化值。
- search 只在提交时更新 URL；筛选和翻页一次性更新，避免每次输入都查询和污染 history。
- 列表保持稳定排序，查询更新时保留上一结果；不保存可派生的重复列表。
- 静态目录长缓存，业务 mutation 后精确失效；不增加第二层可变内存数据库。
- jsdom 使用至少 1,000 条 fixture 验证搜索、筛选、稳定排序和分页正确性，并发现明显算法问题；其墙钟时间
  不作为 SC-003 正式性能证据。
- SC-003 仅按 quickstart 的真实浏览器协议验收：Chromium + production preview、至少 1,000 条当前员工可见
  申请，文本搜索、状态筛选、风险筛选、组合筛选和翻页各执行 20 次，从提交操作到新结果或明确状态可见，
  汇总样本 P95 必须不超过 2 秒；首次应用启动时间不计入。
- MVP 不使用路由级预取、虚拟列表、复杂 memoization 或自定义缓存算法。

## 3～5 天交付顺序

| 时间 | 可验收增量 |
|---|---|
| 第 1 天 | Vite/strict/tooling；领域模型、Zod schema、纯规则与 unit tests；gateway contract、seed 与 IndexedDB reset |
| 第 2 天 | AppShell、Demo 身份 Context；列表查询、URL parser、四态 UI、筛选/分页及 integration tests |
| 第 3 天 | 创建表单、详情直达、批准/拒绝、revision 冲突、缓存失效及无障碍焦点/播报 |
| 第 4 天 | 核心 E2E、真实持久化/重开验证、1,000 条性能验收、build 与跨状态视觉收尾 |
| 第 5 天缓冲 | 修复高风险缺陷、补缺失验收和作品说明；不扩展范围或引入新架构层 |

每个后续 task 必须关联 specification 的 FR/SC 或本计划的明确门禁，并产出可独立验证的小增量。

## 关键技术决策与取舍

| 决策 | 选择 | 取舍理由 |
|---|---|---|
| 路由 | React Router Declarative Mode | 只需路径与 URL state；避免与 Query 重叠的数据 loader |
| Server state | TanStack Query | 统一查询、mutation、重试和失效；不手写缓存 |
| 业务持久化 | IndexedDB + `idb` | 比 localStorage 多一个小依赖，但获得异步事务与可靠审批冲突 |
| Mock 边界 | Promise gateway + 确定性 decorator | 无真实 HTTP，故不引入 Axios/MSW；未来 adapter 可替换 |
| Global client state | React Context 仅存 current user ID | 确有跨页面生命周期但只有一个标量，不值得引入 Zustand |
| 表单 | React Hook Form + Zod | 减少局部状态代码，并复用运行时 schema |
| 样式 | Tailwind CSS，无 UI Library | 快速完成一致视觉，同时保留语义 HTML 与焦点控制 |
| 审批更新 | 保守 mutation + revision CAS | 短延迟不值得 optimistic rollback；事务保证唯一终态 |
| 测试 | Vitest/RTL + 2 条 Playwright | 风险分层；E2E 只覆盖浏览器真实闭环和冲突 |

详细研究依据见 [research.md](research.md)，运行与验收步骤见 [quickstart.md](quickstart.md)。
