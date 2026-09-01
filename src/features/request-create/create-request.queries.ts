import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useAccessFlowGateway } from '../../app/access-flow-context'
import {
  accessFlowQueryKeys,
  useResourceCatalogQuery,
} from '../../app/query-client'
import type { DemoUserId } from '../../domain/models'
import { requestDetailQueryOptions } from '../request-detail/request-detail.queries'
import type { CreateRequestFormValues } from './create-request.schema'

export function useCreateResourceCatalogQuery() {
  return useResourceCatalogQuery()
}

export function useCreateAccessRequestMutation(actorId: DemoUserId) {
  const gateway = useAccessFlowGateway()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (values: CreateRequestFormValues) =>
      gateway.createAccessRequest({
        actorId,
        resourceId: values.resourceId,
        permissionId: values.permission,
        accessUntil: values.expiresAt,
        reason: values.reason,
      }),
    mutationKey: ['accessRequests', 'create', actorId],
    networkMode: 'always',
    retry: false,
    onSuccess: async (request) => {
      // 创建回执不含关联目录，详情缓存只能由 Gateway 的完整可信返回值填充。
      await Promise.all([
        queryClient
          .query(requestDetailQueryOptions(gateway, request.id, actorId))
          .catch(() => undefined),
        queryClient.invalidateQueries({
          queryKey: accessFlowQueryKeys.accessRequests.lists(),
        }),
      ])
    },
  })
}
