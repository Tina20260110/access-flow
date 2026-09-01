import type { ReactElement } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'

import { NotFoundPage } from '../pages/NotFoundPage'
import { AppShell } from './AppShell'

type RoutePlaceholderProps = Readonly<{
  description: string
  title: string
}>

function RoutePlaceholder({
  description,
  title,
}: RoutePlaceholderProps): ReactElement {
  return (
    <section>
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="mt-3 text-slate-600">{description}</p>
    </section>
  )
}

export function AccessFlowRoutes(): ReactElement {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route element={<Navigate replace to="/requests" />} index />
        <Route
          element={
            <RoutePlaceholder
              description="列表业务界面将在对应用户故事任务中实现。"
              title="申请列表"
            />
          }
          path="requests"
        />
        <Route
          element={
            <RoutePlaceholder
              description="创建业务界面将在对应用户故事任务中实现。"
              title="创建权限申请"
            />
          }
          path="requests/new"
        />
        <Route
          element={
            <RoutePlaceholder
              description="详情与审批业务界面将在对应用户故事任务中实现。"
              title="权限申请详情"
            />
          }
          path="requests/:requestId"
        />
        <Route element={<NotFoundPage />} path="*" />
      </Route>
    </Routes>
  )
}

export function AppRouter(): ReactElement {
  return (
    <BrowserRouter>
      <AccessFlowRoutes />
    </BrowserRouter>
  )
}
