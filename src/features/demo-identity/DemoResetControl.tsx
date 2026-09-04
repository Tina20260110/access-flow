import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react'

import { useAccessFlowGateway } from '../../app/access-flow-context'
import { resetAccessFlowDomainQueryCache } from '../../app/query-client'

type DemoResetControlProps = Readonly<{
  failureMessage?: string
  onResetSuccess: () => Promise<void> | void
}>

export function DemoResetControl({
  failureMessage = 'Demo 数据重置失败，现有数据和页面状态均未更改。',
  onResetSuccess,
}: DemoResetControlProps): ReactElement {
  const gateway = useAccessFlowGateway()
  const queryClient = useQueryClient()
  const [isConfirming, setIsConfirming] = useState(false)
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const shouldRestoreFocusRef = useRef(false)

  const resetMutation = useMutation({
    mutationFn: () => gateway.resetDemoData(),
    networkMode: 'always',
    retry: false,
    onSuccess: async () => {
      await onResetSuccess()
      await resetAccessFlowDomainQueryCache(queryClient)
      shouldRestoreFocusRef.current = false
      setIsConfirming(false)
      setAnnouncement('Demo 数据已恢复为初始状态。')
    },
  })

  useEffect(() => {
    if (isConfirming) {
      cancelRef.current?.focus()
      return
    }

    if (shouldRestoreFocusRef.current) {
      shouldRestoreFocusRef.current = false
      triggerRef.current?.focus()
    }
  }, [isConfirming])

  function closeDialog(): void {
    if (resetMutation.isPending) return
    shouldRestoreFocusRef.current = true
    setIsConfirming(false)
    resetMutation.reset()
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeDialog()
      return
    }

    if (event.key !== 'Tab') return
    const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>(
      'button:not(:disabled)',
    )
    if (!buttons || buttons.length === 0) return

    const first = buttons.item(0)
    const last = buttons.item(buttons.length - 1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div>
      <button
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
        onClick={() => {
          setAnnouncement(null)
          resetMutation.reset()
          shouldRestoreFocusRef.current = true
          setIsConfirming(true)
        }}
        ref={triggerRef}
        type="button"
      >
        重置 Demo 数据
      </button>

      {announcement ? (
        <p className="mt-2 max-w-xs text-sm font-medium text-green-800" role="status">
          {announcement}
        </p>
      ) : null}

      {isConfirming ? (
        <div
          aria-describedby="demo-reset-description"
          aria-labelledby="demo-reset-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onKeyDown={handleDialogKeyDown}
          ref={dialogRef}
          role="dialog"
        >
          <section className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold" id="demo-reset-title">
              确认重置 Demo 数据？
            </h2>
            <p className="mt-3 text-slate-700" id="demo-reset-description">
              当前浏览器中的 AccessFlow Demo 数据将恢复为初始演示数据。
              此操作无法撤销。
            </p>
            {resetMutation.isError ? (
              <p className="mt-4 text-red-800" role="alert">
                {failureMessage}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-60"
                disabled={resetMutation.isPending}
                onClick={closeDialog}
                ref={cancelRef}
                type="button"
              >
                取消
              </button>
              <button
                className="rounded-md bg-red-700 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={resetMutation.isPending}
                onClick={() => {
                  resetMutation.mutate()
                }}
                type="button"
              >
                {resetMutation.isPending
                  ? '正在重置…'
                  : resetMutation.isError
                    ? '重新尝试重置'
                    : '确认重置'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
