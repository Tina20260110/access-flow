import {
  useCallback,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react'

import { useDemoUsersQuery } from '../../app/query-client'
import type { DemoPreferencesAdapter } from '../../data/demo-preferences'
import { DEFAULT_DEMO_USER_ID } from '../../data/seed-data'
import type { DemoUser, DemoUserId } from '../../domain/models'
import {
  DemoIdentityContext,
  type DemoIdentityValue,
} from './demo-identity-context'

type DemoIdentityProviderProps = PropsWithChildren<{
  defaultDemoUserId?: DemoUserId
  preferences: DemoPreferencesAdapter
}>

type ResolvedDemoIdentityProviderProps = PropsWithChildren<{
  initialDemoUserId: DemoUserId
  preferences: DemoPreferencesAdapter
  users: readonly DemoUser[]
}>

function ResolvedDemoIdentityProvider({
  children,
  initialDemoUserId,
  preferences,
  users,
}: ResolvedDemoIdentityProviderProps): ReactElement {
  const [currentDemoUserId, setCurrentDemoUserIdState] =
    useState(initialDemoUserId)

  const setCurrentDemoUserId = useCallback(
    (userId: DemoUserId) => {
      preferences.saveCurrentDemoUserId(userId, users)
      setCurrentDemoUserIdState(userId)
    },
    [preferences, users],
  )

  const value = useMemo<DemoIdentityValue>(
    () => ({ currentDemoUserId, setCurrentDemoUserId }),
    [currentDemoUserId, setCurrentDemoUserId],
  )

  // Context 只共享身份 ID；员工对象继续由 Demo Users query 持有和派生。
  return (
    <DemoIdentityContext.Provider value={value}>
      {children}
    </DemoIdentityContext.Provider>
  )
}

export function DemoIdentityProvider({
  children,
  defaultDemoUserId = DEFAULT_DEMO_USER_ID,
  preferences,
}: DemoIdentityProviderProps): ReactElement {
  const usersQuery = useDemoUsersQuery()

  if (usersQuery.isPending) {
    return <p role="status">正在加载演示员工…</p>
  }

  if (usersQuery.isError) {
    return (
      <section role="alert">
        <p>无法加载演示员工。</p>
        <button type="button" onClick={() => void usersQuery.refetch()}>
          重试
        </button>
      </section>
    )
  }

  const initialDemoUserId = preferences.loadCurrentDemoUserId(
    usersQuery.data,
    defaultDemoUserId,
  )
  const directoryIdentity = usersQuery.data.map((user) => user.id).join('|')

  return (
    <ResolvedDemoIdentityProvider
      key={directoryIdentity}
      initialDemoUserId={initialDemoUserId}
      preferences={preferences}
      users={usersQuery.data}
    >
      {children}
    </ResolvedDemoIdentityProvider>
  )
}
