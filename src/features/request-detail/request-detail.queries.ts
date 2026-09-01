import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'

import { useAccessFlowGateway } from '../../app/access-flow-context'
import { accessFlowQueryKeys } from '../../app/query-client'
import type {
  AccessFlowGateway,
  AccessRequestDetails,
} from '../../data/access-flow-gateway'
import { isAccessFlowError } from '../../domain/errors'
import type {
  AccessRequest,
  AccessRequestId,
  DemoUserId,
} from '../../domain/models'
import type { RejectRequestFormValues } from './reject-request.schema'

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

function updateCurrentDetail(
  queryClient: QueryClient,
  request: AccessRequest,
  viewerId: DemoUserId,
): void {
  queryClient.setQueryData<AccessRequestDetails>(
    accessFlowQueryKeys.accessRequests.detail(request.id, viewerId),
    (current) =>
      current === undefined ? undefined : { ...current, request },
  )
}

async function invalidateRequestLists(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: accessFlowQueryKeys.accessRequests.lists(),
  })
}

async function refreshAfterConflict(
  queryClient: QueryClient,
  requestId: AccessRequestId,
  viewerId: DemoUserId,
): Promise<void> {
  // 冲突不能复用旧决定；先让当前详情重新读取 Gateway 的终态，再只标记列表缓存过期。
  await queryClient.invalidateQueries({
    queryKey: accessFlowQueryKeys.accessRequests.detail(requestId, viewerId),
  })
  await invalidateRequestLists(queryClient)
}

export function useApproveRequestMutation(
  request: AccessRequest,
  actorId: DemoUserId,
) {
  const gateway = useAccessFlowGateway()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      gateway.approveAccessRequest({
        actorId,
        requestId: request.id,
        // 客户端只能回传读取详情时的版本，revision 的递增由领域转换负责。
        expectedRevision: request.revision,
      }),
    mutationKey: [
      'accessRequests',
      'approve',
      request.id,
      actorId,
      request.revision,
    ],
    networkMode: 'always',
    retry: false,
    onSuccess: async (approved) => {
      updateCurrentDetail(queryClient, approved, actorId)
      await invalidateRequestLists(queryClient)
    },
    onError: async (error) => {
      if (isAccessFlowError(error) && error.code === 'CONFLICT') {
        await refreshAfterConflict(queryClient, request.id, actorId)
      }
    },
  })
}

export function useRejectRequestMutation(
  request: AccessRequest,
  actorId: DemoUserId,
) {
  const gateway = useAccessFlowGateway()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (values: RejectRequestFormValues) =>
      gateway.rejectAccessRequest({
        actorId,
        requestId: request.id,
        expectedRevision: request.revision,
        rejectionReason: values.rejectionReason,
      }),
    mutationKey: [
      'accessRequests',
      'reject',
      request.id,
      actorId,
      request.revision,
    ],
    networkMode: 'always',
    retry: false,
    onSuccess: async (rejected) => {
      updateCurrentDetail(queryClient, rejected, actorId)
      await invalidateRequestLists(queryClient)
    },
    onError: async (error) => {
      if (isAccessFlowError(error) && error.code === 'CONFLICT') {
        await refreshAfterConflict(queryClient, request.id, actorId)
      }
    },
  })
}
