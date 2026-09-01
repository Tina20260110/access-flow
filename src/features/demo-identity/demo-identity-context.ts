import { createContext, useContext } from 'react'

import type { DemoUserId } from '../../domain/models'

export type DemoIdentityValue = Readonly<{
  currentDemoUserId: DemoUserId
  setCurrentDemoUserId: (userId: DemoUserId) => void
}>

export const DemoIdentityContext = createContext<DemoIdentityValue | null>(null)

export function useDemoIdentity(): DemoIdentityValue {
  const identity = useContext(DemoIdentityContext)
  if (!identity) {
    throw new Error('useDemoIdentity 必须在 DemoIdentityProvider 内使用')
  }
  return identity
}
