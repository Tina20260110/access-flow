import type { ReactElement } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'

import { NotFoundPage } from '../pages/NotFoundPage'
import { CreateRequestPage } from '../pages/CreateRequestPage'
import { RequestDetailPage } from '../pages/RequestDetailPage'
import { RequestListPage } from '../pages/RequestListPage'
import { AppShell } from './AppShell'

export function AccessFlowRoutes(): ReactElement {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route element={<Navigate replace to="/requests" />} index />
        <Route element={<RequestListPage />} path="requests" />
        <Route
          element={<CreateRequestPage />}
          path="requests/new"
        />
        <Route
          element={<RequestDetailPage />}
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
