import { useEffect, useRef, type ReactElement } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { z } from 'zod'

import type { AccessRequestId } from '../domain/models'
import { accessRequestIdSchema } from '../domain/schemas'
import { useDemoIdentity } from '../features/demo-identity/demo-identity-context'
import { ApprovalPanel } from '../features/request-detail/ApprovalPanel'
import { RequestDetails } from '../features/request-detail/RequestDetails'
import {
  getRequestDetailErrorKind,
  useRequestDetailQuery,
} from '../features/request-detail/request-detail.queries'

const creationNavigationStateSchema = z.strictObject({
  creationSucceeded: z.literal(true),
})

type ResolvedRequestDetailPageProps = Readonly<{
  requestId: AccessRequestId
}>

function ResolvedRequestDetailPage({
  requestId,
}: ResolvedRequestDetailPageProps): ReactElement {
  const { currentDemoUserId } = useDemoIdentity()
  const requestQuery = useRequestDetailQuery(requestId, currentDemoUserId)

  if (requestQuery.isPending) {
    return (
      <p className="mt-8" role="status">
        正在加载申请详情…
      </p>
    )
  }

  if (requestQuery.isError) {
    const notAvailable =
      getRequestDetailErrorKind(requestQuery.error) === 'not-available'

    return (
      <div
        className="mt-8 rounded-lg border border-slate-300 bg-white p-6"
        role="alert"
      >
        <p>
          {notAvailable
            ? '申请不存在或当前员工不可查看。'
            : '无法加载申请详情。'}
        </p>
        {notAvailable ? null : (
          <button
            className="mt-4 rounded-md border border-slate-400 px-4 py-2"
            onClick={() => void requestQuery.refetch()}
            type="button"
          >
            重新加载申请详情
          </button>
        )}
        <p className="mt-4">
          <Link className="underline" to="/requests">
            返回申请列表
          </Link>
        </p>
      </div>
    )
  }

  return (
    <>
      <RequestDetails details={requestQuery.data} />
      <ApprovalPanel
        actorId={currentDemoUserId}
        request={requestQuery.data.request}
      />
    </>
  )
}

export function RequestDetailPage(): ReactElement {
  const location = useLocation()
  const params = useParams()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const requestIdParam = params['requestId']
  const requestIdResult = accessRequestIdSchema.safeParse(requestIdParam)
  const navigationState: unknown = location.state
  const creationSucceeded =
    creationNavigationStateSchema.safeParse(navigationState).success

  useEffect(() => {
    const previousTitle = document.title
    document.title = '权限申请详情 | AccessFlow'
    headingRef.current?.focus()

    return () => {
      document.title = previousTitle
    }
  }, [requestIdParam])

  return (
    <section>
      <h1
        className="text-3xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4"
        ref={headingRef}
        tabIndex={-1}
      >
        权限申请详情
      </h1>

      {creationSucceeded ? (
        <p
          aria-label="创建成功"
          className="mt-5 rounded-md border border-green-300 bg-green-50 p-4 text-green-950"
          role="status"
        >
          申请已创建成功，下面是 Gateway 保存的待审批结果。
        </p>
      ) : null}

      {requestIdResult.success ? (
        <div className="mt-8">
          <ResolvedRequestDetailPage requestId={requestIdResult.data} />
        </div>
      ) : (
        <div
          className="mt-8 rounded-lg border border-slate-300 bg-white p-6"
          role="alert"
        >
          <p>申请不存在或当前员工不可查看。</p>
          <p className="mt-4">
            <Link className="underline" to="/requests">
              返回申请列表
            </Link>
          </p>
        </div>
      )}
    </section>
  )
}
