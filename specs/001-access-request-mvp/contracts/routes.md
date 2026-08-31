# AccessFlow 路由与 URL 状态契约

## 路由表

| Path | 页面 | 访问与行为 |
|---|---|---|
| `/` | 无独立页面 | replace 重定向到 `/requests` |
| `/requests` | 申请列表 | 所有预置身份可访问；数据按当前身份的可见范围查询 |
| `/requests/new` | 创建申请 | 任一有效 Demo 员工身份均可访问，不设置永久角色门禁 |
| `/requests/:requestId` | 申请详情与审批操作 | 当前员工 ID 等于 requesterId 或 approverId 时可见；审批区只对符合关系规则的员工显示 |
| `*` | 未找到 | 显示中文未找到状态和返回列表入口 |

审批批准和拒绝嵌入详情页，不创建额外路由；Demo 用户切换和“重置 Demo 数据”位于 AppShell，不创建独立页面。
静态托管环境必须配置 SPA fallback，使直接打开 `/requests/:requestId` 时仍返回应用入口。

## 列表 URL 参数

规范示例：

```text
/requests?q=alice&status=Pending&risk=High&page=2
```

| 参数 | 合法值 | 默认值 | 规范化规则 |
|---|---|---|---|
| `q` | 任意普通文本 | 空字符串 | trim 后为空则省略；使用 URLSearchParams 编码 |
| `status` | `Pending`、`Approved`、`Rejected` | 全部 | 未知值单独回退为全部并从规范 URL 省略 |
| `risk` | `Low`、`Medium`、`High` | 全部 | 未知值单独回退为全部并从规范 URL 省略 |
| `page` | 正整数 | 1 | 缺失、0、负数、小数、非数字回退为 1；默认值省略 |

未知参数忽略。一个无效参数不得使其他有效参数丢失。申请原因、拒绝原因、表单草稿和其他敏感正文禁止写入
URL。

## 解析与序列化

`parseListQuery(URLSearchParams)` 与 `serializeListQuery(ListQueryState)` 必须是无 React 依赖的纯函数，并满足：

- 原始 URL 值先作为不可信输入逐项通过 Zod 校验，不使用类型断言。
- parse 后得到完整 `ListQueryState`，不返回语义不明的 `undefined`。
- `serialize(parse(serialize(state)))` 得到相同的规范状态。
- 默认值不写入 URL，参数顺序保持稳定，生成可比较、可分享的地址。
- 页面首次发现非规范参数时使用 replace 修正，不添加无意义历史记录。

## 更新历史规则

- 搜索框输入草稿属于 local UI state；提交搜索时才更新 `q`。
- 提交新搜索或改变 status/risk 时，在同一次 URL 更新中将 page 重置为 1，并创建一个可返回的历史记录。
- 仅翻页时保留其余条件并创建历史记录。
- 浏览器前进/后退时 URL 是唯一事实来源；筛选控件和搜索框必须同步显示解析后的值，不从旧组件状态覆盖 URL。
- 查询完成后发现页码超出范围时，使用 replace 调整为最后一个有效页；仍有数据时不得展示误导性空状态。

## 当前 Demo 身份

当前身份不是列表查询条件，不写入 URL。App 根级 Context 仅保存一个通过校验的 `currentUserId`，并由小型
`localStorage` 偏好 adapter 在同一浏览器恢复；读取值不在 Demo Users 中时回退默认身份。身份切换规则：

- 更新当前 ID 后，依赖 viewerId 的 query key 必须重新查询可见范围。
- 位于列表时保留当前规范查询 URL；位于创建或详情页时导航到 `/requests`，避免旧身份上下文残留。
- 当前员工看到 `requesterId` 或 `approverId` 等于本人 ID 的申请并集；同一员工可同时具有两类关系，
  自审批仍由 gateway 阻止。
- 当前 ID 在重置数据后不存在时，恢复到 seed 中确定的默认身份。

## 页面异步状态

### 列表

- 首次加载：显示带文字的 loading 状态，列表区域设置 `aria-busy`。
- 查询更新：保留上一页结果并显示“正在更新”，避免整页闪烁。
- Empty：区分“当前身份没有任何可见申请”与“当前条件没有匹配结果”。
- Error：保留 URL，显示错误摘要和重试按钮。
- Success：语义化表格、带名称的分页 nav、当前页可感知。

### 创建

- 资源目录加载前显示 loading；失败时显示重试。
- 提交中禁用重复提交，成功后导航到新详情并播报成功。
- 失败保留表单值；可恢复错误提供重试。

### 详情与审批

- 详情 loading、不可用、error、success 互斥展示。
- 不存在与不可见使用相同反馈。
- 审批 mutation 进行中时禁用整个审批区。
- 成功以 gateway 返回终态更新页面；冲突时重取并聚焦“申请已被处理”提示。

## 焦点与播报

- 路由导航完成后，焦点移至页面主标题（`tabIndex=-1`），但浏览器前进/后退不得造成重复播报。
- 成功和非阻塞更新使用礼貌 live region 或 `role="status"`。
- 表单错误、持久化错误和审批冲突使用 `role="alert"`；表单失败时聚焦错误摘要或首个无效字段。
- 若使用对话框，打开后焦点进入标题或首个输入，Escape 可关闭，关闭后返回触发按钮。
