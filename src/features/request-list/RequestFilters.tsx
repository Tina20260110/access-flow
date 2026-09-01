import {
  useState,
  type ChangeEvent,
  type ReactElement,
  type SyntheticEvent,
} from 'react'

import {
  REQUEST_STATUSES,
  RISK_LEVELS,
  type ListQueryState,
  type RequestStatus,
  type RiskLevel,
} from '../../domain/models'
import {
  requestStatusSchema,
  riskLevelSchema,
} from '../../domain/schemas'

const STATUS_LABELS: Readonly<Record<RequestStatus, string>> = {
  Pending: '待审批',
  Approved: '已批准',
  Rejected: '已拒绝',
}

const RISK_LABELS: Readonly<Record<RiskLevel, string>> = {
  Low: '低风险',
  Medium: '中风险',
  High: '高风险',
}

type RequestFiltersProps = Readonly<{
  query: ListQueryState
  onSearch: (search: string) => void
  onStatusChange: (status: RequestStatus | null) => void
  onRiskLevelChange: (riskLevel: RiskLevel | null) => void
}>

export function RequestFilters({
  query,
  onRiskLevelChange,
  onSearch,
  onStatusChange,
}: RequestFiltersProps): ReactElement {
  const [searchDraft, setSearchDraft] = useState(query.search)

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    onSearch(searchDraft)
  }

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>): void {
    const value = event.currentTarget.value
    if (value === '') {
      onStatusChange(null)
      return
    }

    const status = requestStatusSchema.safeParse(value)
    if (status.success) onStatusChange(status.data)
  }

  function handleRiskLevelChange(event: ChangeEvent<HTMLSelectElement>): void {
    const value = event.currentTarget.value
    if (value === '') {
      onRiskLevelChange(null)
      return
    }

    const riskLevel = riskLevelSchema.safeParse(value)
    if (riskLevel.success) onRiskLevelChange(riskLevel.data)
  }

  return (
    <form
      className="mt-8 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-[minmax(0,1fr)_12rem_12rem]"
      onSubmit={handleSubmit}
    >
      <div>
        <label className="block text-sm font-medium" htmlFor="request-search">
          搜索申请人或资源
        </label>
        <div className="mt-2 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2"
            id="request-search"
            onChange={(event) => {
              setSearchDraft(event.currentTarget.value)
            }}
            type="search"
            value={searchDraft}
          />
          <button
            className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white"
            type="submit"
          >
            搜索
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="request-status">
          申请状态
        </label>
        <select
          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
          id="request-status"
          onChange={handleStatusChange}
          value={query.status ?? ''}
        >
          <option value="">全部状态</option>
          {REQUEST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="request-risk">
          风险等级
        </label>
        <select
          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
          id="request-risk"
          onChange={handleRiskLevelChange}
          value={query.riskLevel ?? ''}
        >
          <option value="">全部风险</option>
          {RISK_LEVELS.map((riskLevel) => (
            <option key={riskLevel} value={riskLevel}>
              {RISK_LABELS[riskLevel]}
            </option>
          ))}
        </select>
      </div>
    </form>
  )
}
