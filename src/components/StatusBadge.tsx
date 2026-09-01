import type { ReactElement } from 'react'

import type { RequestStatus } from '../domain/models'

const STATUS_LABELS: Readonly<Record<RequestStatus, string>> = {
  Pending: '待审批（Pending）',
  Approved: '已批准（Approved）',
  Rejected: '已拒绝（Rejected）',
}

const STATUS_STYLES: Readonly<Record<RequestStatus, string>> = {
  Pending: 'border-blue-300 bg-blue-50 text-blue-900',
  Approved: 'border-emerald-400 bg-emerald-50 text-emerald-900',
  Rejected: 'border-slate-400 bg-slate-100 text-slate-900',
}

type StatusBadgeProps = Readonly<{
  status: RequestStatus
}>

export function StatusBadge({ status }: StatusBadgeProps): ReactElement {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-sm font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
