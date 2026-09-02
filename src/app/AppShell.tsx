import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'

import { DEFAULT_DEMO_USER_ID } from '../data/seed-data'
import { DemoUserSwitcher } from '../features/demo-identity/DemoUserSwitcher'
import { useDemoIdentity } from '../features/demo-identity/demo-identity-context'
import { useAccessFlowGateway } from './access-flow-context'
import { accessFlowQueryKeys } from './query-client'

function DemoResetControl(): ReactElement {
  const gateway = useAccessFlowGateway()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { setCurrentDemoUserId } = useDemoIdentity()
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
      // 只有持久化重置成功后才丢弃旧申请缓存，避免失败被 UI 伪装成成功。
      queryClient.removeQueries({
        queryKey: accessFlowQueryKeys.accessRequests.all,
      })
      setCurrentDemoUserId(DEFAULT_DEMO_USER_ID)
      shouldRestoreFocusRef.current = false
      setIsConfirming(false)
      setAnnouncement('Demo 数据已恢复为初始状态。')
      await navigate('/requests', { replace: true })
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
              所有新建申请和审批结果都会被初始演示数据替换。此操作无法撤销。
            </p>
            {resetMutation.isError ? (
              <p className="mt-4 text-red-800" role="alert">
                Demo 数据重置失败，现有数据和页面状态均未更改。
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

export function AppShell(): ReactElement {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-5 px-6 py-4">
          <div className="flex flex-wrap items-center gap-6">
            <Link className="text-xl font-semibold" to="/requests">
              AccessFlow
            </Link>
            <nav aria-label="主要导航" className="flex gap-4">
              <Link className="font-medium underline-offset-4 hover:underline" to="/requests">
                申请列表
              </Link>
              <Link className="font-medium underline-offset-4 hover:underline" to="/requests/new">
                创建申请
              </Link>
            </nav>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <DemoUserSwitcher />
            <DemoResetControl />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10" id="main-content">
        <Outlet />
      </main>
    </div>
  )
}
