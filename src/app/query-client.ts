import {
  QueryClient,
  queryOptions,
  useQuery,
} from '@tanstack/react-query'

import type { AccessFlowGateway } from '../data/access-flow-gateway'
import { useAccessFlowGateway } from './access-flow-context'

export const accessFlowQueryKeys = {
  demoUsers: ['demoUsers'] as const,
  resources: ['resources'] as const,
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
    staleTime: DIRECTORY_STALE_TIME,
  })
}

export function resourceCatalogQueryOptions(gateway: AccessFlowGateway) {
  return queryOptions({
    queryKey: accessFlowQueryKeys.resources,
    queryFn: () => gateway.getResources(),
    networkMode: 'always',
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
