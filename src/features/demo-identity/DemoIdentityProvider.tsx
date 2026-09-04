import {
  useCallback,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react'

import { useAccessFlowGateway } from '../../app/access-flow-context'
import { useDemoUsersQuery } from '../../app/query-client'
import type { DemoPreferencesAdapter } from '../../data/demo-preferences'
import { DEFAULT_DEMO_USER_ID } from '../../data/seed-data'
import { isAccessFlowError } from '../../domain/errors'
import type { DemoUser, DemoUserId } from '../../domain/models'
import { DemoResetControl } from './DemoResetControl'
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

type CorruptDemoDataRecoveryProps = Readonly<{
  defaultDemoUserId: DemoUserId
  onRecovered: () => void
  preferences: DemoPreferencesAdapter
}>

function CorruptDemoDataRecovery({
  defaultDemoUserId,
  onRecovered,
  preferences,
}: CorruptDemoDataRecoveryProps): ReactElement {
  const gateway = useAccessFlowGateway()

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <section aria-labelledby="corrupt-demo-data-title">
        <h1 className="text-2xl font-semibold" id="corrupt-demo-data-title">
          Demo 数据已损坏
        </h1>
        <p className="mt-4 text-red-800" role="alert">
          当前持久化数据无法通过完整性校验，应用暂时不可用。
        </p>
        <p className="mt-3 text-slate-700">
          重置后，当前浏览器中的 AccessFlow Demo 数据将恢复为初始演示数据。
        </p>
        <div className="mt-6">
          <DemoResetControl
            failureMessage="Demo 数据重置失败，应用仍处于数据不可用状态。请重试。"
            onResetSuccess={async () => {
              const users = await gateway.getDemoUsers()
              preferences.resetCurrentDemoUserId(defaultDemoUserId, users)
              onRecovered()
              // 损坏数据阻止 Router 挂载；先规范启动地址，恢复后 Router 会从该地址启动。
              window.history.replaceState(window.history.state, '', '/requests')
            }}
          />
        </div>
      </section>
    </main>
  )
}

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
  const [recoveryAnnouncement, setRecoveryAnnouncement] =
    useState<string | null>(null)

  if (usersQuery.isPending) {
    return <p role="status">正在加载演示员工…</p>
  }

  if (usersQuery.isError) {
    if (
      isAccessFlowError(usersQuery.error) &&
      usersQuery.error.code === 'CORRUPT_DEMO_DATA'
    ) {
      return (
        <CorruptDemoDataRecovery
          defaultDemoUserId={defaultDemoUserId}
          onRecovered={() => {
            setRecoveryAnnouncement('Demo 数据已恢复为初始状态。')
          }}
          preferences={preferences}
        />
      )
    }

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
    <>
      {recoveryAnnouncement ? (
        <p className="sr-only" role="status">
          {recoveryAnnouncement}
        </p>
      ) : null}
      <ResolvedDemoIdentityProvider
        key={directoryIdentity}
        initialDemoUserId={initialDemoUserId}
        preferences={preferences}
        users={usersQuery.data}
      >
        {children}
      </ResolvedDemoIdentityProvider>
    </>
  )
}
