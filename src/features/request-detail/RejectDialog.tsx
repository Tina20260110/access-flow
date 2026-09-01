import { zodResolver } from '@hookform/resolvers/zod'
import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
} from 'react'
import { useForm } from 'react-hook-form'

import {
  rejectRequestFormSchema,
  type RejectRequestFormInput,
  type RejectRequestFormValues,
} from './reject-request.schema'

type RejectDialogProps = Readonly<{
  errorMessage: string | null
  isOpen: boolean
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (values: RejectRequestFormValues) => Promise<boolean>
  returnFocusRef: RefObject<HTMLButtonElement | null>
}>

export function RejectDialog({
  errorMessage,
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
  returnFocusRef,
}: RejectDialogProps): ReactElement | null {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const reasonRef = useRef<HTMLTextAreaElement | null>(null)
  const wasOpenRef = useRef(false)
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<RejectRequestFormInput, unknown, RejectRequestFormValues>({
    defaultValues: { rejectionReason: '' },
    resolver: zodResolver(rejectRequestFormSchema),
    shouldFocusError: true,
  })
  const reasonRegistration = register('rejectionReason')

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true
      reasonRef.current?.focus()
      return
    }

    if (wasOpenRef.current) {
      wasOpenRef.current = false
      returnFocusRef.current?.focus()
    }
  }, [isOpen, returnFocusRef])

  function close(): void {
    if (isSubmitting) return
    reset()
    onClose()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }

    if (event.key !== 'Tab') return
    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'textarea:not([disabled]), button:not([disabled])',
      ) ?? [],
    )
    const firstElement = focusableElements.at(0)
    const lastElement = focusableElements.at(-1)

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault()
      lastElement?.focus()
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault()
      firstElement?.focus()
    }
  }

  const submit = handleSubmit(async (values) => {
    const succeeded = await onSubmit(values)
    if (succeeded) {
      reset()
      onClose()
    }
  })

  if (!isOpen) return null

  return (
    <div
      aria-describedby="reject-dialog-description"
      aria-labelledby="reject-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      onKeyDown={handleKeyDown}
      ref={dialogRef}
      role="dialog"
    >
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold" id="reject-dialog-title">
          拒绝权限申请
        </h2>
        <p
          className="mt-2 text-sm text-slate-600"
          id="reject-dialog-description"
        >
          拒绝原因会写入最终审批记录，请说明拒绝依据。
        </p>

        <form
          aria-busy={isSubmitting}
          className="mt-5 space-y-5"
          noValidate
          onSubmit={(event) => {
            void submit(event)
          }}
        >
          {errorMessage === null ? null : (
            <div
              className="rounded-md border border-red-300 bg-red-50 p-3 text-red-950"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          <div>
            <label className="font-medium" htmlFor="rejection-reason">
              拒绝原因
            </label>
            <textarea
              {...reasonRegistration}
              aria-describedby={
                errors.rejectionReason ? 'rejection-reason-error' : undefined
              }
              aria-invalid={errors.rejectionReason ? 'true' : undefined}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2"
              id="rejection-reason"
              ref={(element) => {
                reasonRegistration.ref(element)
                reasonRef.current = element
              }}
              rows={5}
            />
            {errors.rejectionReason ? (
              <p
                className="mt-2 text-sm text-red-700"
                id="rejection-reason-error"
              >
                {errors.rejectionReason.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="rounded-md border border-slate-400 px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              onClick={close}
              type="button"
            >
              取消
            </button>
            <button
              className="rounded-md bg-red-700 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting
                ? '正在拒绝…'
                : errorMessage
                  ? '重新拒绝'
                  : '确认拒绝'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
