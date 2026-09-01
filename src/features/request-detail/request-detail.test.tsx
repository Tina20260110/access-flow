import 'fake-indexeddb/auto'

import type { QueryClient } from '@tanstack/react-query'
import { deleteDB } from 'idb'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AccessFlowProviders } from '../../app/providers'
import {
  accessFlowQueryKeys,
  createAccessFlowQueryClient,
} from '../../app/query-client'
import { AccessFlowRoutes } from '../../app/router'
import type {
  AccessFlowGateway,
  AccessRequestDetails,
} from '../../data/access-flow-gateway'
import {
  DEMO_USER_PREFERENCE_KEY,
  DemoPreferencesAdapter,
} from '../../data/demo-preferences'
import { IndexedDbAccessFlowGateway } from '../../data/indexed-db-gateway'
import {
  accessRequestIdSchema,
  demoUserIdSchema,
} from '../../domain/schemas'
import { gatewayContractRuntime } from '../../test/gateway-contract'
import { MemoryAccessFlowGateway } from '../../test/memory-gateway'
import { DemoIdentityProvider } from '../demo-identity/DemoIdentityProvider'
import {
  REQUEST_DETAIL_STALE_TIME,
  requestDetailQueryOptions,
} from './request-detail.queries'

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

function renderDetail(options: {
  gateway?: AccessFlowGateway
  initialEntry?: string
  queryClient?: QueryClient
  storedUserId?: string
} = {}) {
  const gateway =
    options.gateway ??
    new MemoryAccessFlowGateway({ runtime: gatewayContractRuntime })
  const queryClient = options.queryClient ?? createAccessFlowQueryClient()
  const view = render(
    <TestRoot
      gateway={gateway}
      initialEntry={
        options.initialEntry ?? '/requests/request-pending-high'
      }
      queryClient={queryClient}
      {...(options.storedUserId === undefined
        ? {}
        : { storedUserId: options.storedUserId })}
    >
      <AccessFlowRoutes />
    </TestRoot>,
  )

  return { gateway, queryClient, view }
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

describe('申请详情页面', () => {
  const aliceId = demoUserIdSchema.parse('user-alice')
  const bobId = demoUserIdSchema.parse('user-bob')
  const pendingId = accessRequestIdSchema.parse('request-pending-high')

  it('使用 viewer 隔离的短缓存 Query，并允许窗口聚焦刷新', () => {
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const options = requestDetailQueryOptions(gateway, pendingId, aliceId)

    expect(options).toMatchObject({
      networkMode: 'always',
      refetchOnWindowFocus: true,
      retry: false,
      staleTime: REQUEST_DETAIL_STALE_TIME,
    })
    expect(options.queryKey).toEqual([
      'accessRequests',
      'detail',
      pendingId,
      aliceId,
    ])
  })

  it('从 Loading 进入完整 Pending 详情，直接展示高风险与下一步并管理标题焦点', async () => {
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const originalGetDetails = gateway.getAccessRequest.bind(gateway)
    const deferred = createDeferred<AccessRequestDetails>()
    vi.spyOn(gateway, 'getAccessRequest').mockReturnValueOnce(deferred.promise)
    const { view } = renderDetail({ gateway })

    expect(await screen.findByText('正在加载申请详情…')).toBeInTheDocument()
    deferred.resolve(
      await originalGetDetails({ requestId: pendingId, viewerId: aliceId }),
    )

    const heading = await screen.findByRole('heading', {
      name: '权限申请详情',
    })
    expect(await screen.findByText('数据分析平台')).toBeInTheDocument()
    expect(heading).toHaveFocus()
    expect(document.title).toBe('权限申请详情 | AccessFlow')
    expect(
      screen.getByText('Alice Chen', { selector: 'dd' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Bob Li', { selector: 'dd' }),
    ).toBeInTheDocument()
    expect(screen.getByText('管理访问')).toBeInTheDocument()
    expect(screen.getByText('2026-10-01')).toBeInTheDocument()
    expect(screen.getByText('排查季度报表数据问题')).toBeInTheDocument()
    expect(screen.getByText('待审批（Pending）')).toBeInTheDocument()
    expect(screen.getByText('高风险（High）')).toBeInTheDocument()
    expect(
      screen.getByText('⚠', { selector: 'span[aria-hidden="true"]' }),
    ).toBeInTheDocument()
    expect(screen.getByText('暂无审批记录')).toBeInTheDocument()
    expect(
      screen.getByText('下一步：负责审批员工核对申请并作出决定。'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /批准|拒绝/ }),
    ).not.toBeInTheDocument()
    expect(
      view.container.querySelector(
        'time[datetime="2026-08-30T01:00:00.000Z"]',
      ),
    ).toBeInTheDocument()
  })

  it('分别展示 Approved 与 Rejected 的唯一最终审批记录', async () => {
    const approved = renderDetail({
      initialEntry: '/requests/request-approved-low',
      storedUserId: 'user-bob',
    })

    expect(await screen.findByText('已批准（Approved）')).toBeInTheDocument()
    const approvalHeading = screen.getByRole('heading', { name: '审批记录' })
    const approvalSection = approvalHeading.closest('section')
    if (!approvalSection) throw new Error('审批记录必须位于语义化 section')
    expect(within(approvalSection).getByText('审批结果：已批准')).toBeInTheDocument()
    expect(within(approvalSection).getByText('Alice Chen')).toBeInTheDocument()
    expect(
      screen.getByText('下一步：审批已完成，无需进一步处理。'),
    ).toBeInTheDocument()
    expect(screen.queryByText('拒绝原因')).not.toBeInTheDocument()
    approved.view.unmount()

    renderDetail({
      initialEntry: '/requests/request-rejected-high',
      storedUserId: 'user-carol',
    })
    expect(await screen.findByText('已拒绝（Rejected）')).toBeInTheDocument()
    expect(screen.getByText('审批结果：已拒绝')).toBeInTheDocument()
    expect(screen.getByText('缺少已批准的变更单')).toBeInTheDocument()
    expect(screen.getByText('高风险（High）')).toBeInTheDocument()
    expect(
      screen.getByText('下一步：审批已完成，无需进一步处理。'),
    ).toBeInTheDocument()
  })

  it('对不可见既有申请和未知申请展示完全相同的不可用状态', async () => {
    const hidden = renderDetail({ storedUserId: 'user-dana' })
    const hiddenAlert = await screen.findByRole('alert')
    expect(hiddenAlert).toHaveTextContent('申请不存在或当前员工不可查看。')
    expect(
      screen.queryByRole('button', { name: '重新加载申请详情' }),
    ).not.toBeInTheDocument()
    hidden.view.unmount()

    renderDetail({
      initialEntry: '/requests/request-does-not-exist',
      storedUserId: 'user-dana',
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '申请不存在或当前员工不可查看。',
    )
    expect(
      screen.queryByRole('button', { name: '重新加载申请详情' }),
    ).not.toBeInTheDocument()
  })

  it('保留直达路径并在加载错误后显式重试', async () => {
    const user = userEvent.setup()
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const originalGetDetails = gateway.getAccessRequest.bind(gateway)
    const getDetails = vi.spyOn(gateway, 'getAccessRequest')
      .mockRejectedValueOnce(new Error('详情暂时不可用'))
      .mockImplementation(originalGetDetails)
    renderDetail({ gateway })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '无法加载申请详情。',
    )
    await user.click(
      screen.getByRole('button', { name: '重新加载申请详情' }),
    )

    expect(await screen.findByText('数据分析平台')).toBeInTheDocument()
    expect(getDetails).toHaveBeenCalledTimes(2)
  })

  it('同一申请按 viewer 隔离缓存且不复用其他员工的结果', async () => {
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const getDetails = vi.spyOn(gateway, 'getAccessRequest')
    const queryClient = createAccessFlowQueryClient()
    const requesterView = renderDetail({ gateway, queryClient })
    expect(await screen.findByText('数据分析平台')).toBeInTheDocument()
    requesterView.view.unmount()

    const approverView = renderDetail({
      gateway,
      queryClient,
      storedUserId: 'user-bob',
    })
    expect(await screen.findByText('数据分析平台')).toBeInTheDocument()
    expect(getDetails).toHaveBeenCalledWith({
      requestId: pendingId,
      viewerId: aliceId,
    })
    expect(getDetails).toHaveBeenCalledWith({
      requestId: pendingId,
      viewerId: bobId,
    })
    expect(
      queryClient.getQueryData(
        accessFlowQueryKeys.accessRequests.detail(pendingId, aliceId),
      ),
    ).toMatchObject({ request: { id: pendingId } })
    expect(
      queryClient.getQueryData(
        accessFlowQueryKeys.accessRequests.detail(pendingId, bobId),
      ),
    ).toMatchObject({ request: { id: pendingId } })
    approverView.view.unmount()

    expect(getDetails).toHaveBeenCalledTimes(2)
  })

  it('清空 Query cache 并重挂载后仍从 IndexedDB Gateway 恢复直达详情', async () => {
    const databaseName = 'access-flow-request-detail-cache-recovery'
    const gateway = new IndexedDbAccessFlowGateway({
      databaseName,
      runtime: gatewayContractRuntime,
    })
    const getDetails = vi.spyOn(gateway, 'getAccessRequest')
    const queryClient = createAccessFlowQueryClient()
    let mountedView: ReturnType<typeof renderDetail>['view'] | undefined

    try {
      mountedView = renderDetail({ gateway, queryClient }).view
      expect(await screen.findByText('数据分析平台')).toBeInTheDocument()
      mountedView.unmount()

      queryClient.clear()
      mountedView = renderDetail({ gateway, queryClient }).view
      expect(await screen.findByText('数据分析平台')).toBeInTheDocument()
      expect(getDetails).toHaveBeenCalledTimes(2)
    } finally {
      mountedView?.unmount()
      queryClient.clear()
      await gateway.close()
      await deleteDB(databaseName)
    }
  })
})
