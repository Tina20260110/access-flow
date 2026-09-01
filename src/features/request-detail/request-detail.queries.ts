import { queryOptions, useQuery } from '@tanstack/react-query'

import { useAccessFlowGateway } from '../../app/access-flow-context'
import { accessFlowQueryKeys } from '../../app/query-client'
import type { AccessFlowGateway } from '../../data/access-flow-gateway'
import type {
  AccessRequestId,
  DemoUserId,
} from '../../domain/models'

export const REQUEST_STALE_TIME = 15_000

export function requestDetailQueryOptions(
  gateway: AccessFlowGateway,
  requestId: AccessRequestId,
  viewerId: DemoUserId,
) {
  return queryOptions({
    queryKey: accessFlowQueryKeys.accessRequests.detail(requestId, viewerId),
    queryFn: async () => {
      const details = await gateway.getAccessRequest({ requestId, viewerId })
      return details.request
    },
    networkMode: 'always',
    retry: false,
    staleTime: REQUEST_STALE_TIME,
  })
}

export function useRequestDetailQuery(
  requestId: AccessRequestId,
  viewerId: DemoUserId,
) {
  const gateway = useAccessFlowGateway()
  return useQuery(requestDetailQueryOptions(gateway, requestId, viewerId))
}
