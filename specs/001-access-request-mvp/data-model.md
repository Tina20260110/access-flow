# AccessFlow MVP 数据模型

## 设计目标

- 以判别联合表达 `Pending`、`Approved`、`Rejected` 的合法组合。
- 所有外部或持久化数据先作为 `unknown` 经 Zod 校验，再进入领域层。
- 资源权限风险、审批人分配和状态转换都由纯领域规则决定，UI 不复制规则。
- 持久化结构只服务当前 MVP，不预先设计组织架构、RBAC、多级审批或真实后端模型。

## 基础类型

| 类型 | 表达 | 约束 |
|---|---|---|
| `DemoUserId` | branded string | 非空且只由 schema 校验后创建 |
| `ResourceId` | branded string | 非空且引用已存在资源 |
| `PermissionId` | branded string | 非空且引用已存在权限 |
| `AccessRequestId` | branded string | 全局唯一；新建时使用浏览器原生 UUID |
| `DateOnly` | `YYYY-MM-DD` string | 必须是真实日历日期；按同一浏览器本地业务日期比较 |
| `IsoDateTime` | ISO 8601 string | 创建与审批时间以 UTC 保存，展示时本地化 |
| `RequestStatus` | `Pending \| Approved \| Rejected` | 不增加 `Expired` 等未在规格中的状态 |
| `RiskLevel` | `Low \| Medium \| High` | 由资源权限映射确定，申请人不可编辑 |

## DemoUser

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | `DemoUserId` | 唯一且稳定 |
| `displayName` | string | 去除首尾空白后非空 |

`DemoUser` 只表示企业员工基础身份，不包含 `roles`、Requester、Approver、Admin 或 RBAC 配置。
Requester 与 Approver 是相对于单条 `AccessRequest` 的关系：

- `request.requesterId === user.id` 时，该员工是这条申请的 Requester；
- `request.approverId === user.id` 时，该员工是这条申请的 Approver。

同一员工可以同时查看自己提交的申请和审批分配给自己的其他申请，但任何申请都必须满足
`requesterId !== approverId`。

当前用户对象不得单独持久化；应用级 Context 只保存 `currentUserId`，并从 Demo Users 查询结果派生对象。
当前 ID 经 schema 与 Demo Users 关系校验后由小型 `localStorage` 偏好 adapter 保存；重置 Demo 数据时恢复为
确定的默认身份。

## Permission

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | `PermissionId` | 唯一且稳定 |
| `displayName` | string | 非空；例如只表达业务可选权限，不预设 RBAC 结构 |

Permission 是可复用的权限词汇；能否用于某个资源由 `ResourcePermissionRule` 决定。

## ResourcePermissionRule

| 字段 | 类型 | 规则 |
|---|---|---|
| `permissionId` | `PermissionId` | 必须引用已存在 Permission |
| `riskLevel` | `RiskLevel` | 每个资源权限组合恰好一个等级 |

同一 Resource 内 `permissionId` 不得重复。找不到精确规则时返回 `UNMAPPED_PERMISSION`，禁止使用默认风险。

## Resource

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | `ResourceId` | 唯一且稳定 |
| `displayName` | string | 去除首尾空白后非空 |
| `permissionRules` | 非空 `ResourcePermissionRule[]` | 权限不可重复，每项具有唯一风险映射 |
| `approverCandidateIds` | 非空 `DemoUserId[]` | 有序、无重复，每项引用已存在的 DemoUser |

创建申请时从 `approverCandidateIds` 首项开始，选择第一位不等于 `requesterId` 的用户作为 `approverId`。
没有合格用户时返回 `NO_ELIGIBLE_APPROVER`，不得创建无人负责或允许自审批的申请。

MVP seed 中每个 Resource 的 `approverCandidateIds` 至少包含两位不同员工，确保任一 DemoUser 提交申请时
都存在非本人的审批候选员工；gateway 仍保留无合格员工校验作为领域防线。

## ApprovalRecord

ApprovalRecord 是 AccessRequest 内的一对一值对象，不建立独立集合。

```ts
type ApprovedRecord = Readonly<{
  outcome: 'Approved'
  approverId: DemoUserId
  decidedAt: IsoDateTime
}>

type RejectedRecord = Readonly<{
  outcome: 'Rejected'
  approverId: DemoUserId
  decidedAt: IsoDateTime
  rejectionReason: string
}>

type ApprovalRecord = ApprovedRecord | RejectedRecord
```

拒绝原因去除首尾空白后必须非空；终态记录的 `approverId` 必须等于申请的 `approverId`。

## AccessRequest

### 公共字段

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | `AccessRequestId` | 唯一 |
| `requesterId` | `DemoUserId` | 必须引用已存在 DemoUser；据此派生 Requester 关系 |
| `approverId` | `DemoUserId` | 必须引用已存在 DemoUser 且不等于 requesterId；据此派生 Approver 关系 |
| `resourceId` | `ResourceId` | 必须引用已存在资源 |
| `permissionId` | `PermissionId` | 必须存在于该资源的 permissionRules |
| `accessUntil` | `DateOnly` | 创建时必须晚于提交日；批准时必须晚于批准日 |
| `reason` | string | 去除首尾空白后非空 |
| `riskLevel` | `RiskLevel` | 创建时从资源权限规则复制为历史快照 |
| `createdAt` | `IsoDateTime` | 创建时生成且不可修改 |
| `revision` | positive integer | 新建为 1；每次有效审批增加 1 |

### 状态判别联合

```ts
type PendingAccessRequest = AccessRequestBase & Readonly<{
  status: 'Pending'
  approvalRecord: null
}>

type ApprovedAccessRequest = AccessRequestBase & Readonly<{
  status: 'Approved'
  approvalRecord: ApprovedRecord
}>

type RejectedAccessRequest = AccessRequestBase & Readonly<{
  status: 'Rejected'
  approvalRecord: RejectedRecord
}>

type AccessRequest =
  | PendingAccessRequest
  | ApprovedAccessRequest
  | RejectedAccessRequest
```

`Approved` 的访问开始时间由 `approvalRecord.decidedAt` 派生，不重复保存。截止日期过去只表示已批准访问的
有效期结束，不把申请审批状态改为未在 specification 中定义的 `Expired`。

## ListQueryState

```ts
type ListQueryState = Readonly<{
  search: string
  status: RequestStatus | null
  riskLevel: RiskLevel | null
  page: number
}>
```

- `null` 表示“全部”，不用 `undefined` 表达多种含义。
- `search` 为已提交且去除首尾空白的值；输入中的草稿属于 local UI state。
- `page` 是正整数，默认 1；每页数量固定为 10，不属于可分享状态。
- 列表按 `createdAt` 降序、`id` 升序稳定排序，再分页。
- 可见集合为 `requesterId === viewerId` 与 `approverId === viewerId` 的并集，不重复展示。

分页结果：

```ts
type Page<T> = Readonly<{
  items: readonly T[]
  page: number
  pageSize: 10
  totalItems: number
  totalPages: number
}>
```

## PersistedDemoState

IndexedDB 的 `demo-state` object store 只保存一个根文档：

```ts
type PersistedDemoState = Readonly<{
  schemaVersion: 1
  users: readonly DemoUser[]
  permissions: readonly Permission[]
  resources: readonly Resource[]
  accessRequests: readonly AccessRequest[]
}>
```

### 根级校验

- 所有 ID 在各自集合中唯一，所有引用存在。
- Resource 的审批候选员工都引用有效 DemoUser，权限规则引用有效 Permission；seed 中每个资源至少有两位
  不同候选员工。
- 每条 AccessRequest 的申请人、审批人、资源和权限关系有效。
- 申请保存的 riskLevel 必须是创建时快照；历史数据读取时不因目录变化重算。
- 状态与 ApprovalRecord 判别一致；终态只有一条记录。
- `schemaVersion !== 1` 或任一关系损坏时返回 `CORRUPT_DEMO_DATA`，不得静默接受或部分加载；UI 提供
  “重置 Demo 数据”恢复入口。

## 状态转换

### 共享审批资格规则

`src/domain/request-transitions.ts` 提供可由 UI、状态转换和 Gateway 共同调用的纯 capability predicates：

- `canDecideRequest(request, actorId)`：仅当申请为 `Pending`、`actorId === request.approverId` 且
  `actorId !== request.requesterId` 时返回 true；拒绝操作的业务资格使用该结果，拒绝原因仍由命令校验负责。
- `canApproveRequest(request, actorId, decisionDate)`：先复用 `canDecideRequest`，再要求 `accessUntil` 晚于
  `decisionDate`；到期申请不能批准，但仍可按正常规则拒绝。

`ApprovalPanel` 只能使用这些共享 predicate 决定审批操作是否显示或启用，不得重写条件。真正执行命令时，
状态转换与 Gateway 必须在最新持久化记录的写事务内再次调用同一领域规则，并另行验证 `expectedRevision`；
UI 的判断不能替代业务边界。

| 当前状态 | 命令 | 前置条件 | 结果 |
|---|---|---|---|
| 无 | Create | actor 是有效 DemoUser；字段有效；资源权限有映射；存在非本人审批候选员工 | `Pending`，revision 1 |
| Pending | Approve | actor ID 等于 approverId 且不等于 requesterId；revision 匹配；截止日期晚于批准日 | `Approved`，生成批准记录，revision + 1 |
| Pending | Reject | actor ID 等于 approverId 且不等于 requesterId；revision 匹配；原因非空 | `Rejected`，生成拒绝记录，revision + 1 |
| Approved | Approve/Reject | 无合法转换 | `CONFLICT`，保持原记录 |
| Rejected | Approve/Reject | 无合法转换 | `CONFLICT`，保持原记录 |

批准与拒绝必须在 IndexedDB 同一写事务中基于最新持久化记录执行，并由状态转换复用上述 capability
predicates。UI 缓存只提供 `expectedRevision`，不能成为状态转换的事实来源。

## 数据访问命令

- `CreateAccessRequestCommand`：`actorId`、`resourceId`、`permissionId`、`accessUntil`、`reason`。
- `ApproveAccessRequestCommand`：`actorId`、`requestId`、`expectedRevision`。
- `RejectAccessRequestCommand`：`actorId`、`requestId`、`expectedRevision`、`rejectionReason`。

每个 command 在表单层通过 Zod 后，仍必须由 gateway 重新校验员工身份、申请关系、引用和领域前置条件。
具体操作与错误契约见 [contracts/data-access.md](contracts/data-access.md)。
