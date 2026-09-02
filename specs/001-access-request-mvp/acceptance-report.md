# AccessFlow MVP T048～T052 验收记录

验收日期：2026-09-02
环境：macOS、Node.js 26.8.1、npm 11.19.0、Google Chrome 152.0.7977.66（Chromium）、Vite production preview

## 四组核心验收

| 场景 | 结果 | 验证证据与说明 |
| --- | --- | --- |
| 1. 列表与 URL 恢复 | 通过 | 真实 Chrome 覆盖搜索、状态/风险筛选、刷新、后退/前进、复制地址到新页面、重复参数取首值、首值非法回退、越界页规范化，以及“无可见申请”与“无匹配结果”两种空状态。production preview 的规模验收同时覆盖第 1/2 页切换。 |
| 2. 创建与持久化 | 通过 | 真实 Chrome 覆盖必填字段、纯空白原因和不晚于当天日期的错误关联；仅通过连续表单创建 High Risk 申请，立即进入 Gateway 返回的 Pending 详情，刷新和同一 Browser Context 新页面均恢复相同申请。 |
| 3. 批准闭环 | 通过 | 仅通过可见 UI 完成重置、Alice 创建、列表查找、切换到实际负责员工 Carol、批准、刷新、切回 Alice 并查看唯一最终记录；状态、风险和下一步均直接可见。 |
| 4. 拒绝与过期 | 通过 | 真实 Chrome 覆盖空白拒绝原因、有效拒绝原因、唯一 Rejected 记录，以及过期 Pending 的“批准禁用但仍可拒绝”规则。 |

本批实际补齐了 AppShell 的语义化“申请列表 / 创建申请”导航；否则核心闭环无法仅通过用户可见 UI 从列表进入创建页。未扩展产品范围。

## 无障碍验收

- 键盘主路径可进入创建、提交、查找详情并批准或拒绝；焦点具有全局可见轮廓。
- 创建表单与拒绝表单均使用真实 label；错误通过 `aria-invalid` 与 `aria-describedby` 关联，首个错误字段获得焦点。
- RejectDialog 打开时聚焦原因字段，Tab/Shift+Tab 被限制在对话框内，Escape 关闭后恢复拒绝按钮焦点。
- reset、创建、审批成功、失败和 conflict 使用 `status` 或 `alert` 暴露动态反馈；conflict 提示获得焦点。
- High Risk 使用“高风险（High）”文字、警告符号和边框；Pending/Approved/Rejected 均有文字；详情中的关键下一步始终直接显示，不依赖颜色或折叠区域。
- 对 1440×1100 的真实详情页进行了视觉复核，状态、风险、下一步和审批操作层级清晰，未发现需要新增 UI framework 的问题。

## SC-003 真实浏览器性能

固定协议：production build + production preview；1,000 条对 Alice 全部可见的申请；首次启动不计时；五类操作各 20 次，共 100 个样本；计时结束点为对应新结果完成显示。

| 操作 | P95 |
| --- | ---: |
| 文本搜索 | 338.1 ms |
| 状态筛选 | 306.4 ms |
| 风险筛选 | 313.4 ms |
| 组合筛选 | 1006.2 ms |
| 翻页 | 67.8 ms |
| 全部样本汇总 | **991.2 ms** |

结论：汇总 P95 991.2 ms ≤ 2,000 ms，SC-003 通过；没有性能证据支持增加虚拟列表、额外缓存层或复杂 memoization，因此未做额外优化。

组合筛选的首轮采样暴露的是验收脚本时序问题：脚本在 React 完成前一个 URL 状态提交前立即操作下一控件。协议已改为按真实用户顺序等待每一步 URL 与结果可见后再提交下一筛选；业务代码与架构未因此修改。

## 可重复验证命令

```bash
npx playwright test e2e/access-flow.spec.ts --project=chromium
npx playwright test e2e/approval-conflict.spec.ts --project=chromium
npx playwright test e2e/accessibility.spec.ts --project=chromium
npx playwright test e2e/acceptance.spec.ts --project=chromium
npm run build
npm run test:e2e:performance
```

性能 fixture 仅在测试初始化时写入 IndexedDB；页面重新加载后由生产 `IndexedDbAccessFlowGateway` 读取并经过领域 schema 校验。应用 UI 没有直接访问 IndexedDB，TanStack Query cache 也没有成为持久化事实来源。
