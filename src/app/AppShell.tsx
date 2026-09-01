import type { ReactElement } from 'react'
import { Link, Outlet } from 'react-router-dom'

import { DemoUserSwitcher } from '../features/demo-identity/DemoUserSwitcher'

export function AppShell(): ReactElement {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
          <Link className="text-xl font-semibold" to="/requests">
            AccessFlow
          </Link>
          <DemoUserSwitcher />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10" id="main-content">
        <Outlet />
      </main>
    </div>
  )
}
