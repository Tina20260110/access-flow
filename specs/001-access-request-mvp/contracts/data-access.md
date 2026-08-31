# AccessFlow 数据访问契约

## 目的与边界

`AccessFlowGateway` 是页面/query hooks 与持久化实现之间的唯一业务接口。生产演示使用 IndexedDB adapter，
unit/integration tests 使用内存 adapter；两者必须通过同一契约测试。UI 不得导入 `idb`、访问 object store
或自行读写业务快照。

所有方法均返回 Promise，并只返回经过 Zod 与领域关系校验的值。`actorId`、`viewerId`、`expectedRevision`
必须作为显式输入，不得从隐藏的全局变量读取。

## 操作契约

| 操作 | 输入 | 成功输出 | 主要错误 |
|---|---|---|---|
| `getDemoUsers` | 无 | `DemoUser[]` | `PERSISTENCE_UNAVAILABLE`、`CORRUPT_DEMO_DATA` |
| `getResources` | 无 | `ResourceCatalog` | `PERSISTENCE_UNAVAILABLE`、`CORRUPT_DEMO_DATA` |
| `listAccessRequests` | `viewerId`、`ListQueryState` | `Page<AccessRequestSummary>` | `NOT_FOUND`、`PERSISTENCE_UNAVAILABLE` |
| `getAccessRequest` | `viewerId`、`requestId` | `AccessRequestDetails` | `NOT_FOUND`、`PERSISTENCE_UNAVAILABLE` |
| `createAccessRequest` | `CreateAccessRequestCommand` | `PendingAccessRequest` | `VALIDATION_ERROR`、`NOT_FOUND`、`UNMAPPED_PERMISSION`、`NO_ELIGIBLE_APPROVER` |
| `approveAccessRequest` | `ApproveAccessRequestCommand` | `ApprovedAccessRequest` | `FORBIDDEN`、`EXPIRED_REQUEST`、`CONFLICT` |
| `rejectAccessRequest` | `RejectAccessRequestCommand` | `RejectedAccessRequest` | `VALIDATION_ERROR`、`FORBIDDEN`、`CONFLICT` |
| `resetDemoData` | 无 | `void` | `PERSISTENCE_UNAVAILABLE`、`CORRUPT_SEED_DATA` |

## 查询语义

### Demo Users 与资源目录

- 两个目录是 server state，返回只读快照。
- `DemoUser` 只包含稳定员工 ID 和显示名称，不携带 Requester、Approver、Admin 或其他永久角色；任一有效
  DemoUser 都可以创建申请。
- seed 与持久化读取都必须通过完整 schema 和根级引用校验。
- 资源目录包含允许的权限风险映射和有序审批候选员工列表；UI 可以展示，但不能自行决定最终风险或审批人。
- 每个资源的候选列表必须引用至少两位不同且已存在的 DemoUser，确保任一演示员工创建申请时都能分配给
  另一名员工；gateway 仍必须防御性处理无合格候选员工的输入。

### 列表

- 可见范围：申请人为 viewer 或负责审批人为 viewer 的并集。
- 搜索：对申请人显示名或资源显示名进行去除首尾空白后的不区分大小写部分匹配。
- 组合：search、status、risk 条件同时满足。
- 排序：`createdAt` 降序，时间相同时按 `id` 升序，保证分页稳定。
- 分页：固定每页 10 条；无结果返回 `page = 1`。请求页超出范围时返回最后一个有效页，调用方以 replace
  规范化 URL。
- 详情不可见与不存在统一返回 `NOT_FOUND`，避免从 UI 泄露额外信息。

## 创建申请

Gateway 必须按以下顺序执行：

1. 校验 command shape、非空申请原因和晚于提交日的 `accessUntil`。
2. 校验 actor 是已存在的 DemoUser；任一有效演示员工都可以创建申请。
3. 精确查找资源与权限规则，复制其 riskLevel；未命中时失败，不使用默认值。
4. 从资源的有序 `approverCandidateIds` 中选择第一位不等于 actor 的员工，并写入申请 `approverId`；
   不存在时失败。
5. 生成唯一 ID、UTC 创建时间、`revision = 1`、`status = Pending`、`approvalRecord = null`。
6. 校验完整新根状态并在一个写事务中持久化。

成功只返回已经持久化且重新校验的 Pending 记录。失败不得留下部分申请。

## 批准与拒绝

两个操作必须在 IndexedDB 同一 `readwrite` 事务中完成：

1. 读取并校验最新根状态。
2. 查找申请，并把最新持久化记录交给 domain transition。
3. domain transition 验证申请仍为 Pending 且 `revision === expectedRevision`。
4. domain transition 调用共享 capability predicate，验证 `actorId === request.approverId`、
   `actorId !== request.requesterId` 及其他适用的审批资格，不在 adapter 内复制资格规则。
5. 批准时通过共享 predicate 验证截止日期晚于批准日；拒绝时验证原因去除首尾空白后非空。
6. 生成对应 ApprovalRecord、终态和 `revision + 1`，校验完整根状态后一次写回。
7. 等待事务完成后返回终态。

版本不符或申请已终结统一返回 `CONFLICT`，错误对象必须携带当前 `requestId`，但 UI 只能通过重新查询取得
最新可信详情。mutation 不自动重试，避免隐式重复副作用。

## 错误契约

错误必须具有稳定的 `code`，页面不得依赖英文 message 判定行为。

| Code | 含义 | UI 行为 |
|---|---|---|
| `VALIDATION_ERROR` | command 或字段无效 | 保留输入，关联字段或表单级错误 |
| `NOT_FOUND` | 记录不存在或 viewer 不可见 | 展示统一不可用状态和返回列表入口 |
| `FORBIDDEN` | actor ID 不等于申请 approverId，或尝试自审批 | 移除非法操作，展示明确反馈 |
| `UNMAPPED_PERMISSION` | 资源权限组合没有风险映射 | 要求重新选择资源或权限 |
| `NO_ELIGIBLE_APPROVER` | 资源没有非申请人的审批人 | 阻止创建并说明无法分配 |
| `EXPIRED_REQUEST` | 截止日期已到或已过，不能批准 | 刷新详情，保留拒绝入口 |
| `CONFLICT` | revision 过期或申请已终结 | 失效详情与列表，重取并聚焦冲突提示 |
| `PERSISTENCE_UNAVAILABLE` | 浏览器持久化不可用 | 展示不可继续状态与重试 |
| `CORRUPT_DEMO_DATA` | 已存根状态或关系校验失败 | 不静默覆盖，提供重置 Demo 数据入口 |
| `CORRUPT_SEED_DATA` | 内置 seed 本身无效 | 视为阻断性开发错误，不写入 |
| `TRANSIENT_FAILURE` | 仅由演示或测试故障注入产生 | 展示可重试错误，保证原状态不变 |

## 异步模拟

- `DemoTransportDecorator` 包装 gateway；开发演示使用固定查询延迟约 200ms、变更延迟约 350ms。
- 正常演示禁止随机失败，避免 E2E 和作品展示不稳定。
- tests 可注入零延迟及“下一次指定操作失败”的确定性 fault controller。
- 延迟和故障必须发生在 IndexedDB 事务开始前；事务内不得等待计时器或网络 Promise。

## TanStack Query 契约

Query keys：

```text
['demoUsers']
['resources']
['accessRequests', 'list', viewerId, normalizedListQuery]
['accessRequests', 'detail', requestId, viewerId]
```

- 所有基于本地 `AccessFlowGateway` 的 query 和 mutation 使用 `networkMode: 'always'`，因为数据源不依赖
  联网状态。
- Demo Users 与资源目录使用长 `staleTime`；申请列表与详情使用短而非零的 `staleTime`。
- 创建成功：以返回值填充新详情缓存，失效全部申请列表变体。
- 批准/拒绝成功：以返回值更新当前详情，失效全部申请列表变体。
- `CONFLICT`：立即失效当前详情和申请列表，重取后展示最终状态。
- 窗口重新获得焦点时，申请 query 可按正常 Query 策略重新获取最新持久化状态。
- 重置成功：清除领域 query，恢复默认身份并导航到列表，然后重新获取 active queries。
- mutation 使用保守更新；TanStack Query cache 永远不是业务持久化来源。

## 重置 Demo 数据

重置必须由明确标记的用户操作触发并二次确认。一个写事务用 `createSeedState(today)` 的已校验结果替换根文档，
不得仅删除数据库或留下半初始化状态。重置后恢复默认 Demo 用户、清空表单/对话框局部状态，并重新进入
`/requests`。
