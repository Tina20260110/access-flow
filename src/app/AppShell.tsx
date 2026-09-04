import { type ReactElement } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'

import { DEFAULT_DEMO_USER_ID } from '../data/seed-data'
import { DemoResetControl } from '../features/demo-identity/DemoResetControl'
import { DemoUserSwitcher } from '../features/demo-identity/DemoUserSwitcher'
import { useDemoIdentity } from '../features/demo-identity/demo-identity-context'

function AppShellDemoResetControl(): ReactElement {
  const navigate = useNavigate()
  const { setCurrentDemoUserId } = useDemoIdentity()

  return (
    <DemoResetControl
      onResetSuccess={() => {
        setCurrentDemoUserId(DEFAULT_DEMO_USER_ID)
        void navigate('/requests', { replace: true })
      }}
    />
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
            <AppShellDemoResetControl />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10" id="main-content">
        <Outlet />
      </main>
    </div>
  )
}
