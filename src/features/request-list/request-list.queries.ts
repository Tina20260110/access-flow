import {
  queryOptions,
  useQuery,
} from '@tanstack/react-query'

import { useAccessFlowGateway } from '../../app/access-flow-context'
import { accessFlowQueryKeys } from '../../app/query-client'
import type { AccessFlowGateway } from '../../data/access-flow-gateway'
import { isAccessFlowError } from '../../domain/errors'
import type { DemoUserId, ListQueryState } from '../../domain/models'
import { listQueryStateSchema } from './list-query-state'

export const REQUEST_LIST_STALE_TIME = 15_000

export const DEFAULT_LIST_QUERY: ListQueryState = {
  search: '',
  status: null,
  riskLevel: null,
  page: 1,
}

function retryTransientFailure(failureCount: number, error: unknown): boolean {
  return (
    failureCount < 1 &&
    isAccessFlowError(error) &&
    error.code === 'TRANSIENT_FAILURE'
  )
}

function requestListQueryConfiguration(
  gateway: AccessFlowGateway,
  viewerId: DemoUserId,
  queryInput: ListQueryState,
) {
  const query = listQueryStateSchema.parse(queryInput)

  return {
    queryKey: accessFlowQueryKeys.accessRequests.list(viewerId, query),
    queryFn: () => gateway.listAccessRequests({ viewerId, query }),
    networkMode: 'always' as const,
    retry: retryTransientFailure,
    staleTime: REQUEST_LIST_STALE_TIME,
  }
}

export function requestListQueryOptions(
  gateway: AccessFlowGateway,
  viewerId: DemoUserId,
  queryInput: ListQueryState,
) {
  return queryOptions({
    ...requestListQueryConfiguration(gateway, viewerId, queryInput),
    // URL 查询更新可保留同一员工的旧页；身份切换不能短暂展示上一员工的数据。
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === viewerId ? previousData : undefined,
  })
}

export function useRequestListQuery(
  viewerId: DemoUserId,
  query: ListQueryState,
) {
  const gateway = useAccessFlowGateway()
  return useQuery(requestListQueryOptions(gateway, viewerId, query))
}

export function useVisibleRequestScopeQuery(
  viewerId: DemoUserId,
  enabled: boolean,
) {
  const gateway = useAccessFlowGateway()
  return useQuery({
    ...requestListQueryConfiguration(gateway, viewerId, DEFAULT_LIST_QUERY),
    enabled,
  })
}
