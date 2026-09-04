import {
  QueryClient,
  queryOptions,
  useQuery,
  type Query,
} from '@tanstack/react-query'

import type { AccessFlowGateway } from '../data/access-flow-gateway'
import type {
  AccessRequestId,
  DemoUserId,
  ListQueryState,
} from '../domain/models'
import { useAccessFlowGateway } from './access-flow-context'

export const accessFlowQueryKeys = {
  demoUsers: ['demoUsers'] as const,
  resources: ['resources'] as const,
  accessRequests: {
    all: ['accessRequests'] as const,
    lists: () => ['accessRequests', 'list'] as const,
    list: (viewerId: DemoUserId, query: ListQueryState) =>
      [
        'accessRequests',
        'list',
        viewerId,
        {
          search: query.search,
          status: query.status,
          riskLevel: query.riskLevel,
          page: query.page,
        },
      ] as const,
    detail: (requestId: AccessRequestId, viewerId: DemoUserId) =>
      ['accessRequests', 'detail', requestId, viewerId] as const,
  },
}

export const DIRECTORY_STALE_TIME = Infinity

export function createAccessFlowQueryClient(): QueryClient {
  // 不配置 cache persister；Query cache 可随时重建，业务事实仍只来自 Gateway/IndexedDB。
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 本地 Gateway 不依赖联网状态，离线时仍应正常读取 IndexedDB。
        networkMode: 'always',
      },
      mutations: {
        networkMode: 'always',
      },
    },
  })
}

export function demoUsersQueryOptions(gateway: AccessFlowGateway) {
  return queryOptions({
    queryKey: accessFlowQueryKeys.demoUsers,
    queryFn: () => gateway.getDemoUsers(),
    networkMode: 'always',
    retry: false,
    staleTime: DIRECTORY_STALE_TIME,
  })
}

export function resourceCatalogQueryOptions(gateway: AccessFlowGateway) {
  return queryOptions({
    queryKey: accessFlowQueryKeys.resources,
    queryFn: () => gateway.getResources(),
    networkMode: 'always',
    retry: false,
    staleTime: DIRECTORY_STALE_TIME,
  })
}

export function useDemoUsersQuery() {
  const gateway = useAccessFlowGateway()
  return useQuery(demoUsersQueryOptions(gateway))
}

export function useResourceCatalogQuery() {
  const gateway = useAccessFlowGateway()
  return useQuery(resourceCatalogQueryOptions(gateway))
}

export async function resetAccessFlowDomainQueryCache(
  queryClient: QueryClient,
): Promise<void> {
  const domainRoots = new Set<unknown>([
    accessFlowQueryKeys.demoUsers[0],
    accessFlowQueryKeys.resources[0],
    accessFlowQueryKeys.accessRequests.all[0],
  ])

  const domainQueryFilter = {
    predicate: (query: Query) => domainRoots.has(query.queryKey[0]),
  } as const

  // 非活动数据直接移除；活动数据在重置操作完成前强制从 Gateway 刷新，避免临时卸载整个应用壳。
  queryClient.removeQueries({ ...domainQueryFilter, type: 'inactive' })
  await queryClient.invalidateQueries({
    ...domainQueryFilter,
    refetchType: 'active',
  })
  // 导航可能在刷新期间使详情 Query 变为非活动，再清理一次才不会留下旧页面缓存。
  queryClient.removeQueries({ ...domainQueryFilter, type: 'inactive' })
}
