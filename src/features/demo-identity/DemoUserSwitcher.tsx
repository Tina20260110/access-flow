import {
  useState,
  type ChangeEvent,
  type ReactElement,
} from 'react'
import { useNavigate } from 'react-router-dom'

import { useDemoUsersQuery } from '../../app/query-client'
import { demoUserIdSchema } from '../../domain/schemas'
import { useDemoIdentity } from './demo-identity-context'

export function DemoUserSwitcher(): ReactElement {
  const { currentDemoUserId, setCurrentDemoUserId } = useDemoIdentity()
  const usersQuery = useDemoUsersQuery()
  const navigate = useNavigate()
  const [preferenceError, setPreferenceError] = useState<string | null>(null)

  function handleChange(event: ChangeEvent<HTMLSelectElement>): void {
    const userIdResult = demoUserIdSchema.safeParse(event.currentTarget.value)
    if (!userIdResult.success) return

    try {
      setCurrentDemoUserId(userIdResult.data)
      setPreferenceError(null)
      const browserLocation = event.currentTarget.ownerDocument.defaultView?.location
      const isListRoute = browserLocation?.pathname === '/requests'
      // 浏览器地址可能已进入详情，而并发渲染中的 AppShell 仍是列表快照；以当前地址决定是否保留列表查询。
      void navigate(
        isListRoute
          ? `/requests${browserLocation.search}`
          : '/requests',
        { flushSync: true, replace: isListRoute },
      )
    } catch {
      setPreferenceError('无法保存当前演示员工，请重试。')
    }
  }

  if (usersQuery.isPending) {
    return <p role="status">正在加载身份选项…</p>
  }

  if (usersQuery.isError) {
    return <p role="alert">身份选项加载失败。</p>
  }

  return (
    <div>
      <label htmlFor="demo-user-switcher">当前演示员工</label>
      <select
        id="demo-user-switcher"
        value={currentDemoUserId}
        onChange={handleChange}
      >
        {usersQuery.data.map((user) => (
          <option key={user.id} value={user.id}>
            {user.displayName}
          </option>
        ))}
      </select>
      {preferenceError ? <p role="alert">{preferenceError}</p> : null}
    </div>
  )
}
