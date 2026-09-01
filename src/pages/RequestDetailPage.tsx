import { useEffect, useRef, type ReactElement } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { z } from 'zod'

import { isAccessFlowError } from '../domain/errors'
import type { AccessRequestId } from '../domain/models'
import { accessRequestIdSchema } from '../domain/schemas'
import { useDemoIdentity } from '../features/demo-identity/demo-identity-context'
import { RequestDetails } from '../features/request-detail/RequestDetails'
import { useRequestDetailQuery } from '../features/request-detail/request-detail.queries'

const creationNavigationStateSchema = z.strictObject({
  creationSucceeded: z.literal(true),
})

type ResolvedRequestDetailPageProps = Readonly<{
  creationSucceeded: boolean
  requestId: AccessRequestId
}>

function ResolvedRequestDetailPage({
  creationSucceeded,
  requestId,
}: ResolvedRequestDetailPageProps): ReactElement {
  const { currentDemoUserId } = useDemoIdentity()
  const requestQuery = useRequestDetailQuery(requestId, currentDemoUserId)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (requestQuery.isSuccess) headingRef.current?.focus()
  }, [requestQuery.isSuccess])

  if (requestQuery.isPending) {
    return <p role="status">正在加载申请确认信息…</p>
  }

  if (requestQuery.isError) {
    const notAvailable =
      isAccessFlowError(requestQuery.error) &&
      requestQuery.error.code === 'NOT_FOUND'

    return (
      <section role="alert">
        <h1 className="text-3xl font-semibold">权限申请详情</h1>
        <p className="mt-3">
          {notAvailable
            ? '申请不存在或当前员工不可查看。'
            : '无法加载申请确认信息。'}
        </p>
        {notAvailable ? null : (
          <button
            className="mt-4 rounded-md border border-slate-400 px-4 py-2"
            onClick={() => void requestQuery.refetch()}
            type="button"
          >
            重试加载
          </button>
        )}
      </section>
    )
  }

  return (
    <RequestDetails
      creationSucceeded={creationSucceeded}
      headingRef={headingRef}
      request={requestQuery.data}
    />
  )
}

export function RequestDetailPage(): ReactElement {
  const location = useLocation()
  const params = useParams()
  const requestIdResult = accessRequestIdSchema.safeParse(params['requestId'])
  const navigationState: unknown = location.state
  const creationSucceeded =
    creationNavigationStateSchema.safeParse(navigationState).success

  if (!requestIdResult.success) {
    return (
      <section role="alert">
        <h1 className="text-3xl font-semibold">权限申请详情</h1>
        <p className="mt-3">申请不存在或当前员工不可查看。</p>
      </section>
    )
  }

  return (
    <ResolvedRequestDetailPage
      creationSucceeded={creationSucceeded}
      requestId={requestIdResult.data}
    />
  )
}
