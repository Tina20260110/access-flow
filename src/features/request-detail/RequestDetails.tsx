import type { RefObject, ReactElement } from 'react'

import type { AccessRequest } from '../../domain/models'

const statusLabels = {
  Approved: '已批准（Approved）',
  Pending: '待审批（Pending）',
  Rejected: '已拒绝（Rejected）',
} as const

const riskLabels = {
  High: '高风险（High）',
  Low: '低风险（Low）',
  Medium: '中风险（Medium）',
} as const

type RequestDetailsProps = Readonly<{
  creationSucceeded: boolean
  headingRef: RefObject<HTMLHeadingElement | null>
  request: AccessRequest
}>

export function RequestDetails({
  creationSucceeded,
  headingRef,
  request,
}: RequestDetailsProps): ReactElement {
  return (
    <section>
      <h1
        className="text-3xl font-semibold"
        ref={headingRef}
        tabIndex={-1}
      >
        权限申请详情
      </h1>

      {creationSucceeded ? (
        <p
          aria-label="创建成功"
          className="mt-5 rounded-md border border-green-300 bg-green-50 p-4 text-green-950"
          role="status"
        >
          申请已创建成功，下面是 Gateway 保存的待审批结果。
        </p>
      ) : null}

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-slate-600">申请 ID</dt>
            <dd className="mt-1 break-all">{request.id}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">当前状态</dt>
            <dd className="mt-1">当前状态：{statusLabels[request.status]}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">风险等级</dt>
            <dd className="mt-1">风险等级：{riskLabels[request.riskLevel]}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">负责审批员工</dt>
            <dd className="mt-1">负责审批员工 ID：{request.approverId}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">申请版本</dt>
            <dd className="mt-1">申请版本：{request.revision}</dd>
          </div>
        </dl>
        {request.status === 'Pending' ? (
          <p className="mt-6 font-medium">下一步：等待负责审批员工处理。</p>
        ) : null}
      </div>
    </section>
  )
}
