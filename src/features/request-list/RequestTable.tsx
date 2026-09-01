import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import { RiskBadge } from '../../components/RiskBadge'
import { StatusBadge } from '../../components/StatusBadge'
import type { AccessRequestSummary } from '../../data/access-flow-gateway'
import type { Page } from '../../domain/models'

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

type RequestTableProps = Readonly<{
  page: Page<AccessRequestSummary>
  onPageChange: (page: number) => void
}>

export function RequestTable({
  onPageChange,
  page,
}: RequestTableProps): ReactElement {
  const hasPreviousPage = page.page > 1
  const hasNextPage = page.page < page.totalPages

  return (
    <section className="mt-6" aria-label="申请列表结果">
      <p className="text-sm text-slate-600">共 {page.totalItems} 条申请</p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full border-collapse" aria-label="权限申请列表">
          <thead className="bg-slate-100 text-left text-sm text-slate-700">
            <tr>
              <th className="px-4 py-3 font-semibold" scope="col">申请人</th>
              <th className="px-4 py-3 font-semibold" scope="col">目标资源</th>
              <th className="px-4 py-3 font-semibold" scope="col">申请权限</th>
              <th className="px-4 py-3 font-semibold" scope="col">风险等级</th>
              <th className="px-4 py-3 font-semibold" scope="col">当前状态</th>
              <th className="px-4 py-3 font-semibold" scope="col">创建时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {page.items.map((request) => (
              <tr key={request.id}>
                <td className="px-4 py-3">{request.requester.displayName}</td>
                <td className="px-4 py-3">
                  <Link
                    aria-label={`查看 ${request.requester.displayName} 的${request.resource.displayName}申请`}
                    className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-4"
                    to={`/requests/${request.id}`}
                  >
                    {request.resource.displayName}
                  </Link>
                </td>
                <td className="px-4 py-3">{request.permission.displayName}</td>
                <td className="px-4 py-3">
                  <RiskBadge riskLevel={request.riskLevel} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={request.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <time dateTime={request.createdAt}>
                    {dateTimeFormatter.format(new Date(request.createdAt))}
                  </time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav
        className="mt-4 flex items-center justify-between gap-4"
        aria-label="申请列表分页"
      >
        <button
          className="rounded-md border border-slate-300 bg-white px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasPreviousPage}
          onClick={() => {
            onPageChange(page.page - 1)
          }}
          type="button"
        >
          上一页
        </button>
        <p aria-live="polite">
          第 {page.page} / {page.totalPages} 页
        </p>
        <button
          className="rounded-md border border-slate-300 bg-white px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasNextPage}
          onClick={() => {
            onPageChange(page.page + 1)
          }}
          type="button"
        >
          下一页
        </button>
      </nav>
    </section>
  )
}
