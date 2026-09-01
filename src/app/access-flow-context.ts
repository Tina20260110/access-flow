import { createContext, useContext } from 'react'

import type { AccessFlowGateway } from '../data/access-flow-gateway'

export const AccessFlowGatewayContext =
  createContext<AccessFlowGateway | null>(null)

export function useAccessFlowGateway(): AccessFlowGateway {
  const gateway = useContext(AccessFlowGatewayContext)
  if (!gateway) {
    throw new Error('useAccessFlowGateway 必须在 AccessFlowProviders 内使用')
  }
  return gateway
}
