import { useEffect, useMemo, type ReactElement } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useDemoIdentity } from '../features/demo-identity/demo-identity-context'
import { RequestFilters } from '../features/request-list/RequestFilters'
import { RequestTable } from '../features/request-list/RequestTable'
import {
  DEFAULT_LIST_QUERY,
  useRequestListQuery,
  useVisibleRequestScopeQuery,
} from '../features/request-list/request-list.queries'
import {
  isCanonicalListQuery,
  parseListQuery,
  serializeListQuery,
  setListQueryPage,
  setListQueryRiskLevel,
  setListQuerySearch,
  setListQueryStatus,
} from '../features/request-list/list-query-state'
import type { ListQueryState } from '../domain/models'

function hasNarrowingCondition(query: ListQueryState): boolean {
  return (
    query.search !== '' || query.status !== null || query.riskLevel !== null
  )
}

export function RequestListPage(): ReactElement {
  const { currentDemoUserId } = useDemoIdentity()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawSearch = searchParams.toString()
  const query = useMemo(
    () => parseListQuery(new URLSearchParams(rawSearch)),
    [rawSearch],
  )
  const canonicalSearch = serializeListQuery(query).toString()
  const listQuery = useRequestListQuery(currentDemoUserId, query)
  const needsVisibleScopeCheck =
    listQuery.isSuccess &&
    !listQuery.isPlaceholderData &&
    listQuery.data.totalItems === 0 &&
    hasNarrowingCondition(query)
  const visibleScopeQuery = useVisibleRequestScopeQuery(
    currentDemoUserId,
    needsVisibleScopeCheck,
  )

  useEffect(() => {
    if (!isCanonicalListQuery(new URLSearchParams(rawSearch))) {
      setSearchParams(new URLSearchParams(canonicalSearch), { replace: true })
    }
  }, [canonicalSearch, rawSearch, setSearchParams])

  useEffect(() => {
    if (
      listQuery.data === undefined ||
      listQuery.isPlaceholderData ||
      listQuery.data.page === query.page
    ) {
      return
    }

    // 占位结果属于上一组查询；只用新响应页码规范化 URL，避免旧页覆盖用户刚提交的条件。
    setSearchParams(
      serializeListQuery(setListQueryPage(query, listQuery.data.page)),
      { replace: true },
    )
  }, [listQuery.data, listQuery.isPlaceholderData, query, setSearchParams])

  function commitQuery(nextQuery: ListQueryState): void {
    const nextSearch = serializeListQuery(nextQuery).toString()
    if (nextSearch === canonicalSearch) return
    setSearchParams(new URLSearchParams(nextSearch))
  }

  function clearQuery(): void {
    commitQuery(DEFAULT_LIST_QUERY)
  }

  let content: ReactElement

  if (listQuery.isPending) {
    content = (
      <section className="mt-6" aria-busy="true" aria-live="polite">
        <p>正在加载申请列表…</p>
      </section>
    )
  } else if (listQuery.isError) {
    content = (
      <section className="mt-6 rounded-xl border border-red-300 bg-red-50 p-5" role="alert">
        <p className="font-semibold">无法加载申请列表。</p>
        <p className="mt-1">当前查询条件已保留，请稍后重试。</p>
        <button
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 font-medium text-white"
          onClick={() => void listQuery.refetch()}
          type="button"
        >
          重新加载申请列表
        </button>
      </section>
    )
  } else if (listQuery.data.totalItems === 0) {
    if (needsVisibleScopeCheck && visibleScopeQuery.isPending) {
      content = (
        <section className="mt-6" aria-busy="true" aria-live="polite">
          <p>正在确认当前员工的可见申请…</p>
        </section>
      )
    } else if (needsVisibleScopeCheck && visibleScopeQuery.isError) {
      content = (
        <section className="mt-6 rounded-xl border border-red-300 bg-red-50 p-5" role="alert">
          <p className="font-semibold">无法确认申请范围。</p>
          <button
            className="mt-4 rounded-md bg-slate-900 px-4 py-2 font-medium text-white"
            onClick={() => void visibleScopeQuery.refetch()}
            type="button"
          >
            重新确认
          </button>
        </section>
      )
    } else if (
      !hasNarrowingCondition(query) ||
      visibleScopeQuery.data?.totalItems === 0
    ) {
      content = (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6" role="status">
          <h2 className="text-lg font-semibold">暂无可见申请</h2>
          <p className="mt-2">当前员工还没有可见的权限申请。</p>
        </section>
      )
    } else {
      content = (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6" role="status">
          <h2 className="text-lg font-semibold">没有匹配结果</h2>
          <p className="mt-2">当前查询没有匹配结果。</p>
          <button
            className="mt-4 rounded-md border border-slate-300 bg-white px-4 py-2 font-medium"
            onClick={clearQuery}
            type="button"
          >
            清除查询条件
          </button>
        </section>
      )
    }
  } else {
    content = (
      <>
        {listQuery.isFetching ? (
          <p className="mt-4" role="status">
            正在更新申请列表…
          </p>
        ) : null}
        <RequestTable
          page={listQuery.data}
          onPageChange={(page) => {
            commitQuery(setListQueryPage(query, page))
          }}
        />
      </>
    )
  }

  return (
    <section>
      <h1 className="text-3xl font-semibold">申请列表</h1>
      <p className="mt-3 text-slate-600">
        查看自己提交或分配给当前员工处理的权限申请。
      </p>
      <RequestFilters
        key={query.search}
        query={query}
        onRiskLevelChange={(riskLevel) => {
          commitQuery(setListQueryRiskLevel(query, riskLevel))
        }}
        onSearch={(search) => {
          commitQuery(setListQuerySearch(query, search))
        }}
        onStatusChange={(status) => {
          commitQuery(setListQueryStatus(query, status))
        }}
      />
      {content}
    </section>
  )
}
