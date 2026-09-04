import type { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import {
  MemoryRouter,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AccessFlowProviders } from '../../app/providers'
import {
  accessFlowQueryKeys,
  createAccessFlowQueryClient,
} from '../../app/query-client'
import { AccessFlowRoutes } from '../../app/router'
import type {
  AccessFlowGateway,
  AccessRequestSummary,
} from '../../data/access-flow-gateway'
import {
  DEMO_USER_PREFERENCE_KEY,
  DemoPreferencesAdapter,
} from '../../data/demo-preferences'
import { createSeedState } from '../../data/seed-data'
import { AccessFlowError } from '../../domain/errors'
import type { Page, PersistedDemoState } from '../../domain/models'
import {
  demoUserIdSchema,
  parsePersistedDemoState,
} from '../../domain/schemas'
import {
  GATEWAY_CONTRACT_TODAY,
  gatewayContractRuntime,
} from '../../test/gateway-contract'
import { MemoryAccessFlowGateway } from '../../test/memory-gateway'
import { DemoIdentityProvider } from '../demo-identity/DemoIdentityProvider'
import {
  REQUEST_LIST_STALE_TIME,
  requestListQueryOptions,
} from './request-list.queries'

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
  initialEntry: string
  queryClient: QueryClient
  storedUserId?: string
}>

function TestRoot({
  children,
  gateway,
  initialEntry,
  queryClient,
  storedUserId,
}: TestRootProps) {
  const storage = new TestPreferenceStorage()
  if (storedUserId !== undefined) {
    storage.setItem(DEMO_USER_PREFERENCE_KEY, storedUserId)
  }

  return (
    <AccessFlowProviders gateway={gateway} queryClient={queryClient}>
      <DemoIdentityProvider preferences={new DemoPreferencesAdapter(storage)}>
        <MemoryRouter initialEntries={[initialEntry]}>
          {children}
        </MemoryRouter>
      </DemoIdentityProvider>
    </AccessFlowProviders>
  )
}

function HistoryProbe() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <aside aria-label="测试历史导航">
      <output aria-label="当前测试地址">
        {location.pathname + location.search}
      </output>
      <button type="button" onClick={() => void navigate(-1)}>
        测试后退
      </button>
      <button type="button" onClick={() => void navigate(1)}>
        测试前进
      </button>
    </aside>
  )
}

function renderList(options: {
  gateway?: AccessFlowGateway
  initialEntry?: string
  storedUserId?: string
} = {}) {
  const initialEntry = options.initialEntry ?? '/requests'
  window.history.replaceState(window.history.state, '', initialEntry)
  const gateway =
    options.gateway ??
    new MemoryAccessFlowGateway({ runtime: gatewayContractRuntime })
  const queryClient = createAccessFlowQueryClient()
  const view = render(
    <TestRoot
      gateway={gateway}
      initialEntry={initialEntry}
      queryClient={queryClient}
      {...(options.storedUserId === undefined
        ? {}
        : { storedUserId: options.storedUserId })}
    >
      <HistoryProbe />
      <AccessFlowRoutes />
    </TestRoot>,
  )

  return { gateway, queryClient, view }
}

function createTwelveRequestState(): PersistedDemoState {
  const seed = createSeedState(GATEWAY_CONTRACT_TODAY)
  const accessRequests = Array.from({ length: 12 }, (_, index) => {
    const order = String(index + 1).padStart(2, '0')

    return {
      id: `request-history-${order}`,
      requesterId: 'user-bob',
      approverId: 'user-alice',
      resourceId: 'resource-knowledge',
      permissionId: 'permission-read',
      accessUntil: '2026-10-01',
      reason: `历史导航申请 ${order}`,
      riskLevel: 'Low',
      createdAt: `2026-08-${String(20 - Math.floor(index / 2)).padStart(2, '0')}T08:00:00.000Z`,
      revision: 1,
      status: 'Pending',
      approvalRecord: null,
    } satisfies Record<string, unknown>
  })

  return parsePersistedDemoState({ ...seed, accessRequests })
}

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve(value: T): void {
      resolvePromise?.(value)
    },
  }
}

describe('申请列表页面', () => {
  const aliceId = demoUserIdSchema.parse('user-alice')

  it('展示 Loading 与语义化 Success，并用文字和图标表达 High Risk', async () => {
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const originalList = gateway.listAccessRequests.bind(gateway)
    const deferred = createDeferred<Page<AccessRequestSummary>>()
    vi.spyOn(gateway, 'listAccessRequests').mockReturnValueOnce(deferred.promise)
    renderList({ gateway })

    expect(await screen.findByText('正在加载申请列表…')).toBeInTheDocument()
    deferred.resolve(
      await originalList({
        viewerId: aliceId,
        query: { search: '', status: null, riskLevel: null, page: 1 },
      }),
    )

    const table = await screen.findByRole('table', { name: '权限申请列表' })
    expect(within(table).getByRole('columnheader', { name: '申请人' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: '目标资源' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: '申请权限' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: '风险等级' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: '当前状态' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: '创建时间' })).toBeInTheDocument()
    expect(within(table).getAllByText('高风险（High）')).not.toHaveLength(0)
    expect(within(table).getAllByText('⚠', { selector: 'span[aria-hidden="true"]' })).not.toHaveLength(0)
    expect(screen.getByRole('navigation', { name: '申请列表分页' })).toBeInTheDocument()
  })

  it('按既有纯解析规则规范化非法与重复参数，重挂载恢复相同查询', async () => {
    const initialEntry =
      '/requests?q=%20Alice%20&q=Bob&status=unknown&status=Pending&risk=High&page=99&page=2&private=secret'
    const first = renderList({ initialEntry })

    expect(await screen.findByLabelText('搜索申请人或资源')).toHaveValue('Alice')
    expect(screen.getByLabelText('申请状态')).toHaveValue('')
    expect(screen.getByLabelText('风险等级')).toHaveValue('High')
    await waitFor(() => {
      expect(screen.getByLabelText('当前测试地址')).toHaveTextContent(
        '/requests?q=Alice&risk=High',
      )
    })

    first.view.unmount()
    renderList({ initialEntry: '/requests?q=Alice&risk=High' })
    expect(await screen.findByLabelText('搜索申请人或资源')).toHaveValue('Alice')
    expect(screen.getByLabelText('风险等级')).toHaveValue('High')
    expect(await screen.findByText('数据分析平台')).toBeInTheDocument()
  })

  it('搜索与筛选重置 page，并由浏览器历史恢复 URL 与搜索草稿', async () => {
    const user = userEvent.setup()
    const gateway = new MemoryAccessFlowGateway({
      initialState: createTwelveRequestState(),
      runtime: gatewayContractRuntime,
    })
    renderList({ gateway, initialEntry: '/requests?page=2' })

    expect(await screen.findByText('第 2 / 2 页')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('申请状态'), 'Pending')
    expect(screen.getByLabelText('当前测试地址')).toHaveTextContent(
      '/requests?status=Pending',
    )

    await user.click(screen.getByRole('button', { name: '测试后退' }))
    expect(await screen.findByText('第 2 / 2 页')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('风险等级'), 'Low')
    expect(screen.getByLabelText('当前测试地址')).toHaveTextContent(
      '/requests?risk=Low',
    )

    await user.click(screen.getByRole('button', { name: '测试后退' }))
    expect(await screen.findByText('第 2 / 2 页')).toBeInTheDocument()

    await user.type(screen.getByLabelText('搜索申请人或资源'), '知识库')
    await user.click(screen.getByRole('button', { name: '搜索' }))
    expect(screen.getByLabelText('当前测试地址')).toHaveTextContent(
      '/requests?q=%E7%9F%A5%E8%AF%86%E5%BA%93',
    )
    expect(await screen.findByText('第 1 / 2 页')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '测试后退' }))
    expect(await screen.findByText('第 2 / 2 页')).toBeInTheDocument()
    expect(screen.getByLabelText('搜索申请人或资源')).toHaveValue('')

    await user.click(screen.getByRole('button', { name: '测试前进' }))
    expect(await screen.findByText('第 1 / 2 页')).toBeInTheDocument()
    expect(screen.getByLabelText('搜索申请人或资源')).toHaveValue('知识库')
  })

  it('身份切换保留 URL，并通过包含 viewerId 的 query key 获取新可见并集', async () => {
    const user = userEvent.setup()
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const listRequests = vi.spyOn(gateway, 'listAccessRequests')
    const { queryClient } = renderList({
      gateway,
      initialEntry: '/requests?risk=High',
    })

    expect(await screen.findByText('共 2 条申请')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('当前演示员工'), 'user-bob')
    expect(await screen.findByText('共 1 条申请')).toBeInTheDocument()
    expect(screen.getByLabelText('当前测试地址')).toHaveTextContent(
      '/requests?risk=High',
    )
    expect(listRequests).toHaveBeenCalledWith(
      expect.objectContaining({ viewerId: 'user-alice' }),
    )
    expect(listRequests).toHaveBeenCalledWith(
      expect.objectContaining({ viewerId: 'user-bob' }),
    )
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: accessFlowQueryKeys.accessRequests.lists() })
        .map((query) => query.queryKey),
    ).toEqual(
      expect.arrayContaining([
        ['accessRequests', 'list', 'user-alice', {
          search: '',
          status: null,
          riskLevel: 'High',
          page: 1,
        }],
        ['accessRequests', 'list', 'user-bob', {
          search: '',
          status: null,
          riskLevel: 'High',
          page: 1,
        }],
      ]),
    )
  })

  it('查询更新时保留旧结果并明确播报正在更新', async () => {
    const user = userEvent.setup()
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const originalList = gateway.listAccessRequests.bind(gateway)
    const deferred = createDeferred<Page<AccessRequestSummary>>()
    vi.spyOn(gateway, 'listAccessRequests').mockImplementation((input) => {
      if (input.query.status === 'Approved') return deferred.promise
      return originalList(input)
    })
    renderList({ gateway })

    expect(await screen.findByText('共 4 条申请')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('申请状态'), 'Approved')

    expect(await screen.findByText('正在更新申请列表…')).toBeInTheDocument()
    expect(screen.getByText('共 4 条申请')).toBeInTheDocument()
    deferred.resolve(
      await originalList({
        viewerId: aliceId,
        query: {
          search: '',
          status: 'Approved',
          riskLevel: null,
          page: 1,
        },
      }),
    )
    expect(await screen.findByText('共 1 条申请')).toBeInTheDocument()
  })

  it('区分无可见申请与无匹配结果，并允许清除查询', async () => {
    const noVisible = renderList({
      initialEntry: '/requests?q=%E4%B8%8D%E5%AD%98%E5%9C%A8',
      storedUserId: 'user-dana',
    })
    expect(
      await screen.findByText('当前员工还没有可见的权限申请。'),
    ).toBeInTheDocument()
    noVisible.view.unmount()

    const user = userEvent.setup()
    renderList({ initialEntry: '/requests?q=%E4%B8%8D%E5%AD%98%E5%9C%A8' })
    expect(
      await screen.findByText('当前查询没有匹配结果。'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '清除查询条件' }))
    expect(await screen.findByText('共 4 条申请')).toBeInTheDocument()
    expect(screen.getByLabelText('当前测试地址')).toHaveTextContent('/requests')
  })

  it('错误状态保留当前 URL，并提供显式重试入口', async () => {
    const user = userEvent.setup()
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const originalList = gateway.listAccessRequests.bind(gateway)
    vi.spyOn(gateway, 'listAccessRequests')
      .mockRejectedValueOnce(new Error('列表暂时不可用'))
      .mockImplementation(originalList)
    renderList({ gateway, initialEntry: '/requests?status=Pending' })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '无法加载申请列表',
    )
    expect(screen.getByLabelText('当前测试地址')).toHaveTextContent(
      '/requests?status=Pending',
    )

    await user.click(screen.getByRole('button', { name: '重新加载申请列表' }))
    expect(await screen.findByRole('table', { name: '权限申请列表' })).toBeInTheDocument()
    expect(screen.getByLabelText('当前测试地址')).toHaveTextContent(
      '/requests?status=Pending',
    )
  })

  it('列表 Query 使用本地网络模式、短缓存、一次 transient retry 与前页占位', () => {
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const options = requestListQueryOptions(
      gateway,
      aliceId,
      {
      search: '',
      status: null,
      riskLevel: null,
      page: 1,
      },
    )

    expect(options).toMatchObject({
      networkMode: 'always',
      staleTime: REQUEST_LIST_STALE_TIME,
    })
    expect(options.placeholderData).toBeTypeOf('function')
    expect(options.retry).toBeTypeOf('function')
    if (typeof options.retry !== 'function') {
      throw new Error('列表 retry 必须使用按错误类型判断的函数')
    }
    const transientError = new AccessFlowError(
      'TRANSIENT_FAILURE',
      '测试瞬时失败',
    )
    expect(options.retry(0, transientError)).toBe(true)
    expect(options.retry(1, transientError)).toBe(false)
    expect(options.retry(0, new Error('非瞬时失败'))).toBe(false)
    expect(options.queryKey).toEqual([
      'accessRequests',
      'list',
      'user-alice',
      { search: '', status: null, riskLevel: null, page: 1 },
    ])
  })
})
