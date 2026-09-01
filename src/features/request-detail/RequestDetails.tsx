import type { ReactElement } from 'react'

import type { AccessRequestDetails } from '../../data/access-flow-gateway'
import type { IsoDateTime } from '../../domain/models'
import { RiskBadge } from '../../components/RiskBadge'
import { StatusBadge } from '../../components/StatusBadge'

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'long',
  timeStyle: 'short',
})

function formatDateTime(value: IsoDateTime): string {
  return dateTimeFormatter.format(new Date(value))
}

type RequestDetailsProps = Readonly<{
  details: AccessRequestDetails
}>

export function RequestDetails({ details }: RequestDetailsProps): ReactElement {
  const { approver, permission, request, requester, resource } = details
  const nextStep =
    request.status === 'Pending'
      ? '下一步：负责审批员工核对申请并作出决定。'
      : '下一步：审批已完成，无需进一步处理。'

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="request-overview-heading"
        className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2
              className="text-xl font-semibold"
              id="request-overview-heading"
            >
              申请概览
            </h2>
            <p className="mt-1 break-all text-sm text-slate-500">
              申请 ID：{request.id}
            </p>
          </div>
          <div
            aria-label="申请当前状态和风险等级"
            className="flex flex-wrap gap-2"
          >
            <StatusBadge status={request.status} />
            <RiskBadge riskLevel={request.riskLevel} />
          </div>
        </div>

        <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-slate-600">申请人</dt>
            <dd className="mt-1">
              {requester.displayName}
              <span className="ml-2 text-sm text-slate-500">
                {requester.id}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-600">
              负责审批员工
            </dt>
            <dd className="mt-1">
              {approver.displayName}
              <span className="ml-2 text-sm text-slate-500">
                {approver.id}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-600">目标资源</dt>
            <dd className="mt-1">{resource.displayName}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-600">申请权限</dt>
            <dd className="mt-1">{permission.displayName}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-600">访问截止日期</dt>
            <dd className="mt-1">
              <time dateTime={request.accessUntil}>{request.accessUntil}</time>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-600">创建时间</dt>
            <dd className="mt-1">
              <time dateTime={request.createdAt}>
                {formatDateTime(request.createdAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-600">申请版本</dt>
            <dd className="mt-1">{request.revision}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-slate-600">申请原因</dt>
            <dd className="mt-1 whitespace-pre-wrap">{request.reason}</dd>
          </div>
        </dl>
      </section>

      <aside
        aria-label="当前下一步"
        className="rounded-lg border-2 border-slate-400 bg-slate-50 p-5"
      >
        <p className="font-semibold">
          <span aria-hidden="true" className="mr-2">
            →
          </span>
          {nextStep}
        </p>
      </aside>

      <section
        aria-labelledby="approval-record-heading"
        className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-xl font-semibold" id="approval-record-heading">
          审批记录
        </h2>

        {request.status === 'Pending' ? (
          <p className="mt-4 text-slate-700">
            <span aria-hidden="true" className="mr-2">
              —
            </span>
            <strong>暂无审批记录</strong>，申请仍在等待处理。
          </p>
        ) : (
          <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-slate-600">审批结果</dt>
              <dd className="mt-1 font-medium">
                审批结果：
                {request.status === 'Approved' ? '已批准' : '已拒绝'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-600">处理员工</dt>
              <dd className="mt-1">{approver.displayName}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-600">处理时间</dt>
              <dd className="mt-1">
                <time dateTime={request.approvalRecord.decidedAt}>
                  {formatDateTime(request.approvalRecord.decidedAt)}
                </time>
              </dd>
            </div>
            {request.status === 'Rejected' ? (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-slate-600">
                  拒绝原因
                </dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {request.approvalRecord.rejectionReason}
                </dd>
              </div>
            ) : null}
          </dl>
        )}
      </section>
    </div>
  )
}
