import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react'

import { isAccessFlowError } from '../../domain/errors'
import type {
  AccessRequest,
  DateOnly,
  DemoUserId,
} from '../../domain/models'
import {
  canApproveRequest,
  canDecideRequest,
} from '../../domain/request-transitions'
import { dateOnlySchema } from '../../domain/schemas'
import {
  useApproveRequestMutation,
  useRejectRequestMutation,
} from './request-detail.queries'
import type { RejectRequestFormValues } from './reject-request.schema'
import { RejectDialog } from './RejectDialog'

type ApprovalFeedback = Readonly<{
  kind: 'success' | 'error' | 'conflict'
  message: string
}> | null

type ApprovalPanelProps = Readonly<{
  actorId: DemoUserId
  request: AccessRequest
}>

function getLocalToday(): DateOnly {
  const now = new Date()
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return dateOnlySchema.parse(`${year}-${month}-${day}`)
}

function approvalErrorMessage(
  error: unknown,
  operation: 'approve' | 'reject',
): ApprovalFeedback {
  if (isAccessFlowError(error)) {
    if (error.code === 'CONFLICT') {
      return {
        kind: 'conflict',
        message: '申请已经发生变化或已被处理，已重新获取最新状态。',
      }
    }
    if (error.code === 'EXPIRED_REQUEST') {
      return {
        kind: 'error',
        message: '访问期限已到，不能批准；仍可拒绝。',
      }
    }
    if (error.code === 'FORBIDDEN') {
      return {
        kind: 'error',
        message: '当前员工不能处理这条申请，已保留原状态。',
      }
    }
    if (error.code === 'TRANSIENT_FAILURE') {
      return {
        kind: 'error',
        message:
          operation === 'approve'
            ? '批准暂时失败，请重试。'
            : '拒绝暂时失败，请重试。',
      }
    }
  }

  return {
    kind: 'error',
    message:
      operation === 'approve'
        ? '批准失败，申请保持原状态，请重试。'
        : '拒绝失败，申请保持原状态，请重试。',
  }
}

export function ApprovalPanel({
  actorId,
  request,
}: ApprovalPanelProps): ReactElement | null {
  const approveMutation = useApproveRequestMutation(request, actorId)
  const rejectMutation = useRejectRequestMutation(request, actorId)
  const rejectTriggerRef = useRef<HTMLButtonElement>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const operationInFlightRef = useRef(false)
  const [feedback, setFeedback] = useState<ApprovalFeedback>(null)
  const [isRejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [isOperationPending, setOperationPending] = useState(false)
  const canDecide = canDecideRequest(request, actorId)
  const canApprove = canApproveRequest(request, actorId, getLocalToday())
  const feedbackIsInsideRejectDialog =
    isRejectDialogOpen &&
    rejectMutation.isError &&
    feedback?.kind === 'error'

  useEffect(() => {
    if (feedback?.kind === 'conflict') feedbackRef.current?.focus()
  }, [feedback])

  async function approve(): Promise<void> {
    if (operationInFlightRef.current) return
    operationInFlightRef.current = true
    setOperationPending(true)
    setFeedback(null)

    try {
      await approveMutation.mutateAsync()
      setFeedback({ kind: 'success', message: '申请已批准。' })
    } catch (error: unknown) {
      setFeedback(approvalErrorMessage(error, 'approve'))
    } finally {
      operationInFlightRef.current = false
      setOperationPending(false)
    }
  }

  async function reject(values: RejectRequestFormValues): Promise<boolean> {
    if (operationInFlightRef.current) return false
    operationInFlightRef.current = true
    setOperationPending(true)
    setFeedback(null)

    try {
      await rejectMutation.mutateAsync(values)
      setFeedback({ kind: 'success', message: '申请已拒绝。' })
      return true
    } catch (error: unknown) {
      setFeedback(approvalErrorMessage(error, 'reject'))
      return false
    } finally {
      operationInFlightRef.current = false
      setOperationPending(false)
    }
  }

  if (!canDecide && feedback === null) return null

  return (
    <section
      aria-busy={isOperationPending}
      aria-labelledby="approval-actions-heading"
      className="mt-6 rounded-lg border-2 border-blue-300 bg-blue-50 p-6"
    >
      <h2 className="text-xl font-semibold" id="approval-actions-heading">
        审批操作
      </h2>

      {isOperationPending ? (
        <p className="sr-only" role="status">
          正在提交审批决定…
        </p>
      ) : null}

      {feedback === null || feedbackIsInsideRejectDialog ? null : (
        <div
          className={`mt-4 rounded-md border p-4 ${
            feedback.kind === 'success'
              ? 'border-green-300 bg-green-50 text-green-950'
              : 'border-red-300 bg-red-50 text-red-950'
          }`}
          ref={feedbackRef}
          role={feedback.kind === 'success' ? 'status' : 'alert'}
          tabIndex={feedback.kind === 'conflict' ? -1 : undefined}
        >
          {feedback.message}
        </div>
      )}

      {canDecide ? (
        <>
          <p className="mt-3 font-medium">
            下一步：核对申请信息后批准，或填写原因后拒绝。
          </p>
          {canApprove ? null : (
            <p className="mt-3 rounded-md border border-amber-400 bg-amber-50 p-3 text-amber-950">
              <span aria-hidden="true" className="mr-2">
                ⚠
              </span>
              访问期限已到，不能批准；仍可拒绝。
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-md bg-green-700 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={!canApprove || isOperationPending}
              onClick={() => void approve()}
              type="button"
            >
              {isOperationPending && approveMutation.isPending
                ? '正在批准…'
                : approveMutation.isError
                  ? '重试批准'
                  : '批准申请'}
            </button>
            <button
              className="rounded-md bg-red-700 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={isOperationPending}
              onClick={() => {
                setFeedback(null)
                setRejectDialogOpen(true)
              }}
              ref={rejectTriggerRef}
              type="button"
            >
              拒绝申请
            </button>
          </div>
          <RejectDialog
            errorMessage={
              feedback?.kind === 'error' && rejectMutation.isError
                ? feedback.message
                : null
            }
            isOpen={isRejectDialogOpen}
            isSubmitting={isOperationPending && rejectMutation.isPending}
            onClose={() => {
              setRejectDialogOpen(false)
            }}
            onSubmit={reject}
            returnFocusRef={rejectTriggerRef}
          />
        </>
      ) : null}
    </section>
  )
}
