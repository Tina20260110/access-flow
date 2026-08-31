# AccessFlow MVP 技术研究与决策

## 1. 运行时与构建基线

**决策**：使用 Node.js `22.22+`，React `19.2.x`、TypeScript `6.0.x`、Vite `8.x` 与
`@vitejs/plugin-react` `6.x`。使用 npm 和单一 lockfile；只采用稳定版本的最新补丁，不采用 beta、RC、
nightly 或 React Compiler 模板。

**理由**：该组合满足 React Router 8 与 Vite 8 的兼容基线。Vite 的 React TypeScript 模板启动成本低，
适合 3～5 天的单页应用。Vite 只转译 TypeScript，因此必须另设 `tsc --noEmit` 类型检查，并显式开启
`strict`。[React 版本](https://react.dev/versions)、[Vite 8](https://vite.dev/blog/announcing-vite8)、
[Vite TypeScript 说明](https://vite.dev/guide/features.html)、
[TypeScript strict](https://www.typescriptlang.org/tsconfig/strict)

**备选方案**：React 18 与 Vite 7 仍可工作，但新项目没有停留旧主版本的收益；TypeScript 7.0 当前会增加
lint 与工具链兼容验证工作，故本次固定在 6.0 稳定线。保留 Vite React TypeScript 模板的 ESLint 基线，
不再引入 Prettier 或额外风格插件。

## 2. 路由与 Server State

**决策**：使用 React Router `8.x` Declarative Mode，仅负责页面、路径参数和 URL 查询参数；使用
TanStack Query `5.x` 管理 Demo Users、资源目录、申请列表、详情以及创建和审批 mutation。

**理由**：React Router 的 Declarative Mode 足以支持当前三个业务页面，不需要 loader/action 或框架模式。
TanStack Query 的 query function 可以调用任意 Promise 数据源，不要求真实 HTTP，适合把浏览器持久化数据按
server state 处理。所有影响查询结果的变量都进入 query key，数据更新后通过精确失效恢复一致性。
[React Router Declarative Mode](https://reactrouter.com/start/declarative/installation)、
[TanStack Query](https://tanstack.com/query/latest/docs/framework/react)、
[Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)

**备选方案**：React Router Data/Framework Mode 会形成第二套数据生命周期；手写 `useEffect`、缓存和重试
容易产生重复状态，因此均不采用。

## 3. 表单、运行时校验与样式

**决策**：使用 React Hook Form `7.x`、`@hookform/resolvers` `5.x` 和 Zod `4.x`；使用 Tailwind CSS
`4.x` 与 `@tailwindcss/vite` 完成视觉层，不引入独立 UI Library。

**理由**：React Hook Form 负责局部表单交互，Zod schema 同时提供运行时校验和类型推导。Zod 用于表单、
URL、持久化数据和数据访问层返回值边界，TypeScript 类型不替代运行时校验。Tailwind 的一方 Vite 插件配置少，
能够在短周期内统一页面状态和焦点样式。[React Hook Form](https://github.com/react-hook-form/react-hook-form)、
[Resolvers](https://github.com/react-hook-form/resolvers)、[Zod](https://zod.dev/)、
[Tailwind Vite 集成](https://tailwindcss.com/docs/installation/using-vite)

**备选方案**：受控表单会增加临时状态与校验同步代码；手写 type guard 容易遗漏状态组合；完整 UI Library
会引入不需要的视觉和组件约定。若目标浏览器早于 Tailwind 4 的现代 CSS 基线，再单独评估 Tailwind 3.4。

## 4. 浏览器持久化与数据访问层

**决策**：使用 IndexedDB 作为业务数据事实来源，引入职责单一的 `idb` Promise 封装。数据库只建立一个
`demo-state` object store，以单条 versioned document 保存 Demo Users、资源、权限规则和申请。UI 与 query
hooks 只依赖异步 `AccessFlowGateway`，不得直接访问 IndexedDB。

**理由**：IndexedDB 满足同一浏览器刷新、重开和身份切换后的持久化，并提供 `readwrite` 事务。`idb` 以很小
体积减少原生事件式 API 的样板代码并提供数据库类型。单 store、单 document 对约 1,000 条验收数据足够，
无需索引、关系表或通用迁移框架。[IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)、
[idb](https://github.com/jakearchibald/idb)

**备选方案**：`localStorage` 更少代码，但同步、只能保存字符串，且 read-modify-write 没有事务，无法可靠验证
并发审批；纯内存不满足重开恢复；原生 IndexedDB 样板代码更多。MSW 能模拟 HTTP，却不负责持久化；当前没有
真实 HTTP 契约，引入它会重复 data access 层，故留待未来真实 API 集成时再评估。

## 5. 并发、延迟与错误模拟

**决策**：每条 `AccessRequest` 保存正整数 `revision`。批准和拒绝 command 必须携带
`expectedRevision`，在同一 IndexedDB `readwrite` 事务内重新读取最新文档、校验 Zod schema、状态、审批人、
截止日期和版本，随后一次写回唯一终态和审批记录。版本或状态不符时返回稳定的 `CONFLICT` 领域错误。

**理由**：同一 object store 的写事务会被串行处理；第一个审批提交后，第二个旧版本操作读取到新 revision 并
失败，能够验证“首个决定生效、后续冲突”的业务规则。延迟和故障注入放在事务之外，避免事务在等待非
IndexedDB Promise 时自动关闭。[IndexedDB 事务](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)、
[idb 事务生命周期](https://github.com/jakearchibald/idb#transaction-lifetime)

**备选方案**：仅禁用按钮不能处理 stale data；乐观更新审批终态需要冲突回滚且没有用户价值。因此 mutation
使用保守更新、禁用重复操作且不自动重试，测试 adapter 提供确定性的延迟、下一次失败和冲突控制。

## 6. 类型模型与状态转换

**决策**：`AccessRequest` 使用以 `status` 判别的联合：`Pending` 的 `approvalRecord` 必须为 `null`，
`Approved` 必须携带批准记录，`Rejected` 必须携带含非空拒绝原因的拒绝记录。领域层暴露纯状态转换函数，
禁止用大量 optional 字段表达互斥状态。

**理由**：判别联合同时约束静态代码、持久化 schema 和测试数据，能让非法状态无法进入可信领域层。风险等级
由资源与权限的直接映射查找，负责审批人由资源的有序审批人列表选择；两个规则都不使用默认兜底。

**备选方案**：单一接口加 optional 字段会允许 `Pending` 携带审批记录、批准记录含拒绝原因等非法组合；
TypeScript `enum` 对序列化和 Zod 判别没有字符串字面量联合直接。

## 7. 状态归属与 Zustand 评估

**决策**：不引入 Zustand。当前 Demo 用户 ID 是唯一 global client state，使用应用根级 React Context 保存，
并通过一个小型 `localStorage` 偏好 adapter 校验和持久化；当前用户对象从 Demo Users query 派生，不重复存储。

**理由**：申请、资源和用户目录是 server state；搜索、状态、风险和页码以 URL 为唯一已提交来源；表单草稿、
对话框和局部交互留在最近组件。为一个低频标量引入状态库不符合最小合理作用域原则。

**备选方案**：将当前身份写入每个 URL 会污染业务链接；将完整用户对象放入 Context 会形成重复状态；只有未来
出现多个相互关联且无法从 URL 或 Query 派生的跨页面 client state 时，才重新评估 Zustand。

## 8. 测试策略

**决策**：使用 Vitest `4.x`、jsdom、React Testing Library、`user-event` 与 `jest-dom` 完成 unit 和
integration tests；使用 Playwright Test 当前稳定 `1.x`，只保留 1 条必需的批准闭环 E2E，时间允许时增加
1 条拒绝闭环，默认 Chromium。

**理由**：Vitest 与 Vite 共用转换链；Testing Library 鼓励按角色、label 和可访问名称验证行为；Playwright
可覆盖真实 IndexedDB、刷新、路由和身份切换。冲突、错误重试及大量边界组合留在更快的 unit/integration 层。
[Vitest](https://vitest.dev/guide/)、[Testing Library 查询优先级](https://testing-library.com/docs/queries/about/)、
[Playwright](https://playwright.dev/docs/intro)

**备选方案**：Jest 会重复构建配置；完全不做 E2E 无法验证持久化闭环；三浏览器全矩阵超出 MVP 时间预算。
测试不设置覆盖率数字门槛，以关键行为和失败路径为完成标准。

## 9. 无障碍与性能边界

**决策**：使用原生语义元素、真实 label、字段错误关联、可感知焦点、`role="status"`/`role="alert"` 和
文字化高风险提示。列表查询只在提交搜索、变更筛选或翻页时更新 URL。资源和 Demo Users 使用长
`staleTime`，申请使用短而非零的 `staleTime`，mutation 成功或冲突后精确更新/失效缓存。

**理由**：这些措施直接覆盖 Constitution 和 specification 的验收要求，同时避免额外组件库。TanStack Query
负责请求去重；1,000 条规模采用普通筛选和分页足够，先以 SC-003 测量再优化。

**备选方案**：虚拟列表、复杂 memoization、预取框架和全局 loading store 均无数据支持，不纳入 MVP。

## 10. 明确不引入

- Zustand：单一全局标量不值得增加状态库。
- MSW 与 Axios：没有真实 HTTP 边界。
- 独立 UI Library：页面和控件规模小，Tailwind 加语义 HTML 足够。
- React Compiler、Server Components、React Actions：与当前客户端 SPA 状态模型重叠。
- 日期库、UUID 库、虚拟列表和通用 repository 基类：原生能力及当前具体 gateway 已满足需求。
