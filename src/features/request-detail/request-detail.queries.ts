import { queryOptions, useQuery } from '@tanstack/react-query'

import { useAccessFlowGateway } from '../../app/access-flow-context'
import { accessFlowQueryKeys } from '../../app/query-client'
import type { AccessFlowGateway } from '../../data/access-flow-gateway'
import { isAccessFlowError } from '../../domain/errors'
import type {
  AccessRequestId,
  DemoUserId,
} from '../../domain/models'

export const REQUEST_DETAIL_STALE_TIME = 15_000

export type RequestDetailErrorKind = 'not-available' | 'retryable'

export function getRequestDetailErrorKind(
  error: unknown,
): RequestDetailErrorKind {
  return isAccessFlowError(error) && error.code === 'NOT_FOUND'
    ? 'not-available'
    : 'retryable'
}

export function requestDetailQueryOptions(
  gateway: AccessFlowGateway,
  requestId: AccessRequestId,
  viewerId: DemoUserId,
) {
  return queryOptions({
    queryKey: accessFlowQueryKeys.accessRequests.detail(requestId, viewerId),
    queryFn: () => gateway.getAccessRequest({ requestId, viewerId }),
    networkMode: 'always',
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: REQUEST_DETAIL_STALE_TIME,
  })
}

export function useRequestDetailQuery(
  requestId: AccessRequestId,
  viewerId: DemoUserId,
) {
  const gateway = useAccessFlowGateway()
  return useQuery(requestDetailQueryOptions(gateway, requestId, viewerId))
}
