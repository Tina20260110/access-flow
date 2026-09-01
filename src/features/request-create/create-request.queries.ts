import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useAccessFlowGateway } from '../../app/access-flow-context'
import {
  accessFlowQueryKeys,
  useResourceCatalogQuery,
} from '../../app/query-client'
import type { DemoUserId } from '../../domain/models'
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
      // 风险、审批人和初始状态只能采用 Gateway 已持久化并校验后的返回值。
      queryClient.setQueryData(
        accessFlowQueryKeys.accessRequests.detail(request.id, actorId),
        request,
      )
      await queryClient.invalidateQueries({
        queryKey: accessFlowQueryKeys.accessRequests.lists(),
      })
    },
  })
}
