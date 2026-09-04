import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import {
  accessFlowQueryKeys,
  createAccessFlowQueryClient,
} from './query-client'
import { AccessFlowProviders } from './providers'
import { AccessFlowRoutes } from './router'
import type { AccessFlowGateway } from '../data/access-flow-gateway'
import {
  DEMO_USER_PREFERENCE_KEY,
  DemoPreferencesAdapter,
} from '../data/demo-preferences'
import {
  DemoTransport,
  DeterministicFaultController,
} from '../data/demo-transport'
import { gatewayContractRuntime } from '../test/gateway-contract'
import { MemoryAccessFlowGateway } from '../test/memory-gateway'
import { DemoIdentityProvider } from '../features/demo-identity/DemoIdentityProvider'
import {
  accessRequestIdSchema,
  demoUserIdSchema,
} from '../domain/schemas'

const pendingRequestId = accessRequestIdSchema.parse('request-pending-high')
const bobId = demoUserIdSchema.parse('user-bob')
const defaultListQuery = {
  search: '',
  status: null,
  riskLevel: null,
  page: 1,
} as const

class TestPreferenceStorage {
  readonly #values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value)
  }
}

function renderAppShell(options: {
  gateway: AccessFlowGateway
  initialEntry?: string
  queryClient?: QueryClient
  storedUserId?: string
}) {
  const queryClient = options.queryClient ?? createAccessFlowQueryClient()
  const storage = new TestPreferenceStorage()
  storage.setItem(
    DEMO_USER_PREFERENCE_KEY,
    options.storedUserId ?? 'user-bob',
  )

  const view = render(
    <AccessFlowProviders gateway={options.gateway} queryClient={queryClient}>
      <DemoIdentityProvider
        preferences={new DemoPreferencesAdapter(storage)}
      >
        <MemoryRouter
          initialEntries={[
            options.initialEntry ?? '/requests/request-pending-high',
          ]}
        >
          <AccessFlowRoutes />
        </MemoryRouter>
      </DemoIdentityProvider>
    </AccessFlowProviders>,
  )

  return { queryClient, storage, view }
}

describe('AppShell Demo 数据重置', () => {
  it('要求二次确认，取消时不调用 Gateway 并恢复触发按钮焦点', async () => {
    const user = userEvent.setup()
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const resetSpy = vi.spyOn(gateway, 'resetDemoData')

    renderAppShell({ gateway })

    expect(
      await screen.findByRole('heading', { name: '权限申请详情' }),
    ).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: '重置 Demo 数据' })
    await user.click(trigger)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(resetSpy).not.toHaveBeenCalled()
    expect(
      screen.getByRole('heading', { name: '权限申请详情' }),
    ).toBeInTheDocument()
  })

  it('成功后只清除全部 AccessFlow 领域缓存、恢复默认员工并导航到列表', async () => {
    const user = userEvent.setup()
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const { queryClient, storage } = renderAppShell({ gateway })

    expect(
      await screen.findByRole('heading', { name: '权限申请详情' }),
    ).toBeInTheDocument()
    const detailKey = accessFlowQueryKeys.accessRequests.detail(
      pendingRequestId,
      bobId,
    )
    const staleListKey = accessFlowQueryKeys.accessRequests.list(
      bobId,
      defaultListQuery,
    )
    const resources = await gateway.getResources()
    const getDemoUsers = vi.spyOn(gateway, 'getDemoUsers')
    const getResources = vi.spyOn(gateway, 'getResources')
    const getAccessRequest = vi.spyOn(gateway, 'getAccessRequest')
    queryClient.setQueryData(accessFlowQueryKeys.resources, resources)
    queryClient.setQueryData(staleListKey, 'stale-list')
    queryClient.setQueryData(['unrelated-query'], '应保留')
    expect(queryClient.getQueryData(detailKey)).toBeDefined()

    await user.click(
      screen.getByRole('button', { name: '重置 Demo 数据' }),
    )
    await user.click(screen.getByRole('button', { name: '确认重置' }))

    expect(
      await screen.findByRole('heading', { name: '申请列表' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('当前演示员工')).toHaveValue('user-alice')
    expect(storage.getItem(DEMO_USER_PREFERENCE_KEY)).toBe('user-alice')
    expect(queryClient.getQueryData(detailKey)).toBeDefined()
    expect(queryClient.getQueryData(staleListKey)).toBeUndefined()
    expect(queryClient.getQueryData(accessFlowQueryKeys.resources)).toBeUndefined()
    expect(queryClient.getQueryData(['unrelated-query'])).toBe('应保留')
    expect(getDemoUsers).toHaveBeenCalledOnce()
    expect(getAccessRequest).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Demo 数据已恢复为初始状态。',
    )

    await user.click(screen.getByRole('link', { name: '创建申请' }))
    expect(
      await screen.findByRole('heading', { name: '创建权限申请' }),
    ).toBeInTheDocument()
    expect(getResources).toHaveBeenCalledOnce()
  })

  it('失败时保留身份、页面和缓存，并允许原地重试', async () => {
    const user = userEvent.setup()
    const faultController = new DeterministicFaultController()
    const memoryGateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const gateway = new DemoTransport(memoryGateway, {
      faultController,
      mutationDelayMs: 0,
      queryDelayMs: 0,
    })
    const { queryClient, storage } = renderAppShell({ gateway })

    expect(
      await screen.findByRole('heading', { name: '权限申请详情' }),
    ).toBeInTheDocument()
    const detailKey = accessFlowQueryKeys.accessRequests.detail(
      pendingRequestId,
      bobId,
    )
    const cachedDetail = queryClient.getQueryData(detailKey)
    faultController.failNext('resetDemoData')

    await user.click(
      screen.getByRole('button', { name: '重置 Demo 数据' }),
    )
    await user.click(screen.getByRole('button', { name: '确认重置' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demo 数据重置失败，现有数据和页面状态均未更改。',
    )
    expect(
      screen.getByRole('heading', { name: '权限申请详情' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('当前演示员工')).toHaveValue('user-bob')
    expect(storage.getItem(DEMO_USER_PREFERENCE_KEY)).toBe('user-bob')
    expect(queryClient.getQueryData(detailKey)).toBe(cachedDetail)

    await user.click(
      screen.getByRole('button', { name: '重新尝试重置' }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: '申请列表' }),
      ).toBeInTheDocument()
    })
    expect(screen.getByLabelText('当前演示员工')).toHaveValue('user-alice')
  })
})
