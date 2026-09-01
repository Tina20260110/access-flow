import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AppRouter } from './app/router'
import { AccessFlowProviders } from './app/providers'
import { createAccessFlowQueryClient } from './app/query-client'
import { DemoPreferencesAdapter } from './data/demo-preferences'
import { DemoTransport } from './data/demo-transport'
import { IndexedDbAccessFlowGateway } from './data/indexed-db-gateway'
import { DemoIdentityProvider } from './features/demo-identity/DemoIdentityProvider'
import './index.css'

const gateway = new DemoTransport(new IndexedDbAccessFlowGateway())
const queryClient = createAccessFlowQueryClient()
const preferences = new DemoPreferencesAdapter(window.localStorage)

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('未找到应用挂载节点')
}

createRoot(rootElement).render(
  <StrictMode>
    <AccessFlowProviders gateway={gateway} queryClient={queryClient}>
      <DemoIdentityProvider preferences={preferences}>
        <AppRouter />
      </DemoIdentityProvider>
    </AccessFlowProviders>
  </StrictMode>,
)
