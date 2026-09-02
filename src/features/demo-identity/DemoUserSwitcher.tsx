import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useDemoUsersQuery } from '../../app/query-client'
import { demoUserIdSchema } from '../../domain/schemas'
import { useDemoIdentity } from './demo-identity-context'

export function DemoUserSwitcher(): ReactElement {
  const { currentDemoUserId, setCurrentDemoUserId } = useDemoIdentity()
  const usersQuery = useDemoUsersQuery()
  const location = useLocation()
  const navigate = useNavigate()
  const [preferenceError, setPreferenceError] = useState<string | null>(null)
  const previousDemoUserIdRef = useRef(currentDemoUserId)

  useEffect(() => {
    const identityChanged =
      previousDemoUserIdRef.current !== currentDemoUserId
    previousDemoUserIdRef.current = currentDemoUserId

    // 身份成功落地后再离开依赖旧 viewer 的页面，避免 Context 更新与导航相互竞争。
    if (identityChanged && location.pathname !== '/requests') {
      void navigate('/requests')
    }
  }, [currentDemoUserId, location.pathname, navigate])

  function handleChange(event: ChangeEvent<HTMLSelectElement>): void {
    const userIdResult = demoUserIdSchema.safeParse(event.currentTarget.value)
    if (!userIdResult.success) return

    try {
      setCurrentDemoUserId(userIdResult.data)
      setPreferenceError(null)
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
