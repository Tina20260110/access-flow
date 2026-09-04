import { useQuery } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import {
  AccessFlowProviders,
} from '../../app/providers'
import {
  createAccessFlowQueryClient,
  demoUsersQueryOptions,
  resourceCatalogQueryOptions,
  useDemoUsersQuery,
} from '../../app/query-client'
import { useAccessFlowGateway } from '../../app/access-flow-context'
import { AccessFlowRoutes, AppRouter } from '../../app/router'
import {
  DEMO_USER_PREFERENCE_KEY,
  DemoPreferencesAdapter,
} from '../../data/demo-preferences'
import {
  DemoTransport,
  DeterministicFaultController,
} from '../../data/demo-transport'
import type { AccessFlowGateway } from '../../data/access-flow-gateway'
import type { ListQueryState } from '../../domain/models'
import { MemoryAccessFlowGateway } from '../../test/memory-gateway'
import { gatewayContractRuntime } from '../../test/gateway-contract'
import {
  DemoIdentityProvider,
} from './DemoIdentityProvider'
import { useDemoIdentity } from './demo-identity-context'
import { DemoUserSwitcher } from './DemoUserSwitcher'

const defaultListQuery: ListQueryState = {
  search: '',
  status: null,
  riskLevel: null,
  page: 1,
}

class TestPreferenceStorage {
  readonly #values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value)
  }
}

type TestRootProps = PropsWithChildren<{
  gateway: AccessFlowGateway
  initialEntry?: string
  queryClient: ReturnType<typeof createAccessFlowQueryClient>
  storage: TestPreferenceStorage
}>

function TestRoot({
  children,
  gateway,
  initialEntry = '/requests',
  queryClient,
  storage,
}: TestRootProps) {
  return (
    <AccessFlowProviders gateway={gateway} queryClient={queryClient}>
      <DemoIdentityProvider
        preferences={new DemoPreferencesAdapter(storage)}
      >
        <MemoryRouter initialEntries={[initialEntry]}>
          {children}
        </MemoryRouter>
      </DemoIdentityProvider>
    </AccessFlowProviders>
  )
}

function IdentityProbe() {
  const identity = useDemoIdentity()
  const gateway = useAccessFlowGateway()
  const usersQuery = useDemoUsersQuery()
  const requestsQuery = useQuery({
    queryKey: ['identity-test-visible-requests', identity.currentDemoUserId],
    queryFn: () =>
      gateway.listAccessRequests({
        viewerId: identity.currentDemoUserId,
        query: defaultListQuery,
      }),
    networkMode: 'always',
  })
  const currentUser = usersQuery.data?.find(
    (user) => user.id === identity.currentDemoUserId,
  )
  const permanentRoleCount =
    usersQuery.data?.filter(
      (user) => 'role' in user || 'roles' in user || 'admin' in user,
    ).length ?? 0

  return (
    <section>
      <p>当前 ID：{identity.currentDemoUserId}</p>
      <p>当前员工：{currentUser?.displayName ?? '加载中'}</p>
      <p>可见申请：{requestsQuery.data?.totalItems ?? '加载中'}</p>
      <p>永久角色字段数：{permanentRoleCount}</p>
      <p>Context 字段：{Object.keys(identity).sort().join(',')}</p>
    </section>
  )
}

function LocationProbe() {
  const location = useLocation()
  return <p>当前位置：{location.pathname + location.search}</p>
}

function renderIdentity(options: {
  initialEntry?: string
  storedUserId?: string
}) {
  const initialEntry = options.initialEntry ?? '/requests'
  window.history.replaceState(window.history.state, '', initialEntry)
  const gateway = new MemoryAccessFlowGateway({
    runtime: gatewayContractRuntime,
  })
  const listRequests = vi.spyOn(gateway, 'listAccessRequests')
  const getDemoUsers = vi.spyOn(gateway, 'getDemoUsers')
  const queryClient = createAccessFlowQueryClient()
  const storage = new TestPreferenceStorage()
  if (options.storedUserId !== undefined) {
    storage.setItem(DEMO_USER_PREFERENCE_KEY, options.storedUserId)
  }

  render(
    <TestRoot
      gateway={gateway}
      initialEntry={initialEntry}
      queryClient={queryClient}
      storage={storage}
    >
      <DemoUserSwitcher />
      <IdentityProbe />
      <LocationProbe />
    </TestRoot>,
  )

  return { gateway, getDemoUsers, listRequests, queryClient, storage }
}

describe('Demo Identity 与根级 Providers', () => {
  it('从合法偏好 ID 派生当前员工，Context 不复制完整用户', async () => {
    renderIdentity({ storedUserId: 'user-bob' })

    expect(await screen.findByText('当前 ID：user-bob')).toBeInTheDocument()
    expect(screen.getByText('当前员工：Bob Li')).toBeInTheDocument()
    expect(await screen.findByText('可见申请：3')).toBeInTheDocument()
    expect(screen.getByText('永久角色字段数：0')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Context 字段：currentDemoUserId,setCurrentDemoUserId',
      ),
    ).toBeInTheDocument()
  })

  it('偏好中的未知员工 ID 回退到确定的默认员工', async () => {
    renderIdentity({ storedUserId: 'user-does-not-exist' })

    expect(await screen.findByText('当前 ID：user-alice')).toBeInTheDocument()
    expect(screen.getByText('当前员工：Alice Chen')).toBeInTheDocument()
  })

  it('切换身份通过 viewerId 生成新 query key，并保留列表 URL', async () => {
    const user = userEvent.setup()
    const { getDemoUsers, listRequests, queryClient, storage } =
      renderIdentity({
        initialEntry: '/requests?q=alice&page=2',
      })
    expect(await screen.findByText('可见申请：4')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('当前演示员工'), 'user-bob')

    expect(await screen.findByText('当前 ID：user-bob')).toBeInTheDocument()
    expect(await screen.findByText('可见申请：3')).toBeInTheDocument()
    expect(
      screen.getByText('当前位置：/requests?q=alice&page=2'),
    ).toBeInTheDocument()
    expect(storage.getItem(DEMO_USER_PREFERENCE_KEY)).toBe('user-bob')
    expect(getDemoUsers).toHaveBeenCalledOnce()
    expect(listRequests).toHaveBeenCalledWith(
      expect.objectContaining({ viewerId: 'user-alice' }),
    )
    expect(listRequests).toHaveBeenCalledWith(
      expect.objectContaining({ viewerId: 'user-bob' }),
    )
    expect(
      queryClient.getQueryCache().findAll({
        queryKey: ['identity-test-visible-requests'],
      }),
    ).toHaveLength(2)
  })

  it('在创建或详情路径切换身份后回到申请列表', async () => {
    const user = userEvent.setup()
    renderIdentity({
      initialEntry: '/requests/request-pending-high',
    })
    await screen.findByText('当前 ID：user-alice')

    await user.selectOptions(screen.getByLabelText('当前演示员工'), 'user-bob')

    await waitFor(() => {
      expect(screen.getByText('当前位置：/requests')).toBeInTheDocument()
    })
  })

  it('为本地 Gateway 统一配置 always 网络模式和目录长缓存', () => {
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const queryClient = createAccessFlowQueryClient()

    expect(queryClient.getDefaultOptions().queries?.networkMode).toBe('always')
    expect(queryClient.getDefaultOptions().mutations?.networkMode).toBe(
      'always',
    )
    expect(demoUsersQueryOptions(gateway)).toMatchObject({
      queryKey: ['demoUsers'],
      networkMode: 'always',
      staleTime: Infinity,
    })
    expect(resourceCatalogQueryOptions(gateway)).toMatchObject({
      queryKey: ['resources'],
      networkMode: 'always',
      staleTime: Infinity,
    })
  })

  it('识别损坏根数据且只在用户确认后显式恢复应用', async () => {
    const user = userEvent.setup()
    const gateway = new MemoryAccessFlowGateway({
      initialState: { schemaVersion: 999 },
      runtime: gatewayContractRuntime,
    })
    const resetDemoData = vi.spyOn(gateway, 'resetDemoData')
    const queryClient = createAccessFlowQueryClient()
    const storage = new TestPreferenceStorage()
    storage.setItem(DEMO_USER_PREFERENCE_KEY, 'user-bob')
    window.history.replaceState(
      window.history.state,
      '',
      '/requests/request-pending-high',
    )

    render(
      <AccessFlowProviders gateway={gateway} queryClient={queryClient}>
        <DemoIdentityProvider
          preferences={new DemoPreferencesAdapter(storage)}
        >
          <AppRouter />
        </DemoIdentityProvider>
      </AccessFlowProviders>,
    )

    expect(await screen.findByText('Demo 数据已损坏')).toBeInTheDocument()
    expect(resetDemoData).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        '重置后，当前浏览器中的 AccessFlow Demo 数据将恢复为初始演示数据。',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重置 Demo 数据' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(resetDemoData).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '确认重置' }))

    expect(
      await screen.findByRole('heading', { name: '申请列表' }),
    ).toBeInTheDocument()
    expect(resetDemoData).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('当前演示员工')).toHaveValue('user-alice')
    expect(storage.getItem(DEMO_USER_PREFERENCE_KEY)).toBe('user-alice')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Demo 数据已恢复为初始状态。',
    )
  })

  it('损坏数据重置失败时保留错误状态并允许重试', async () => {
    const user = userEvent.setup()
    const faultController = new DeterministicFaultController()
    const memoryGateway = new MemoryAccessFlowGateway({
      initialState: { schemaVersion: 999 },
      runtime: gatewayContractRuntime,
    })
    const resetDemoData = vi.spyOn(memoryGateway, 'resetDemoData')
    const gateway = new DemoTransport(memoryGateway, {
      faultController,
      mutationDelayMs: 0,
      queryDelayMs: 0,
    })
    const queryClient = createAccessFlowQueryClient()
    const storage = new TestPreferenceStorage()
    faultController.failNext('resetDemoData')
    window.history.replaceState(
      window.history.state,
      '',
      '/requests/request-pending-high',
    )

    render(
      <AccessFlowProviders gateway={gateway} queryClient={queryClient}>
        <DemoIdentityProvider
          preferences={new DemoPreferencesAdapter(storage)}
        >
          <AppRouter />
        </DemoIdentityProvider>
      </AccessFlowProviders>,
    )

    expect(await screen.findByText('Demo 数据已损坏')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重置 Demo 数据' }))
    await user.click(screen.getByRole('button', { name: '确认重置' }))

    expect(
      await screen.findByText(
        'Demo 数据重置失败，应用仍处于数据不可用状态。请重试。',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Demo 数据已损坏')).toBeInTheDocument()
    expect(resetDemoData).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '重新尝试重置' }))

    expect(
      await screen.findByRole('heading', { name: '申请列表' }),
    ).toBeInTheDocument()
    expect(resetDemoData).toHaveBeenCalledOnce()
  })

  it.each([
    ['/', '申请列表'],
    ['/requests', '申请列表'],
    ['/requests/new', '创建权限申请'],
    ['/requests/request-pending-high', '权限申请详情'],
    ['/unknown', '页面未找到'],
  ])('路由骨架 %s 展示对应占位页面', async (initialEntry, heading) => {
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const queryClient = createAccessFlowQueryClient()
    const storage = new TestPreferenceStorage()

    render(
      <TestRoot
        gateway={gateway}
        initialEntry={initialEntry}
        queryClient={queryClient}
        storage={storage}
      >
        <AccessFlowRoutes />
      </TestRoot>,
    )

    expect(
      await screen.findByRole('heading', { level: 1, name: heading }),
    ).toBeInTheDocument()
  })
})
