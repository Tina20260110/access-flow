import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { PropsWithChildren, ReactElement } from 'react'

import type { AccessFlowGateway } from '../data/access-flow-gateway'
import { AccessFlowGatewayContext } from './access-flow-context'

type AccessFlowProvidersProps = PropsWithChildren<{
  gateway: AccessFlowGateway
  queryClient: QueryClient
}>

export function AccessFlowProviders({
  children,
  gateway,
  queryClient,
}: AccessFlowProvidersProps): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <AccessFlowGatewayContext.Provider value={gateway}>
        {children}
      </AccessFlowGatewayContext.Provider>
    </QueryClientProvider>
  )
}
