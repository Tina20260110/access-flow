import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AccessFlowProviders } from '../../app/providers'
import { createAccessFlowQueryClient } from '../../app/query-client'
import { AccessFlowRoutes } from '../../app/router'
import type { AccessFlowGateway } from '../../data/access-flow-gateway'
import {
  DEMO_USER_PREFERENCE_KEY,
  DemoPreferencesAdapter,
} from '../../data/demo-preferences'
import {
  DemoTransport,
  DeterministicFaultController,
} from '../../data/demo-transport'
import type { ResourceCatalog } from '../../domain/models'
import {
  accessRequestIdSchema,
  demoUserIdSchema,
} from '../../domain/schemas'
import { DemoIdentityProvider } from '../demo-identity/DemoIdentityProvider'
import { gatewayContractRuntime } from '../../test/gateway-contract'
import { MemoryAccessFlowGateway } from '../../test/memory-gateway'

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
  storedUserId?: string
}>

function TestRoot({
  children,
  gateway,
  initialEntry = '/requests/new',
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
        <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
      </DemoIdentityProvider>
    </AccessFlowProviders>
  )
}

function renderCreate(options: {
  gateway?: AccessFlowGateway
  initialEntry?: string
  queryClient?: ReturnType<typeof createAccessFlowQueryClient>
  storedUserId?: string
} = {}) {
  const gateway =
    options.gateway ??
    new MemoryAccessFlowGateway({ runtime: gatewayContractRuntime })
  const queryClient = options.queryClient ?? createAccessFlowQueryClient()
  const view = render(
    <TestRoot
      gateway={gateway}
      {...(options.initialEntry === undefined
        ? {}
        : { initialEntry: options.initialEntry })}
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

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(
    await screen.findByLabelText('目标资源'),
    'resource-analytics',
  )
  await user.selectOptions(
    screen.getByLabelText('请求的权限级别'),
    'permission-manage',
  )
  await user.type(screen.getByLabelText('访问截止日期'), '2099-10-01')
  await user.type(
    screen.getByLabelText('申请原因'),
    '排查季度报表数据问题',
  )
}

describe('创建权限申请页面', () => {
  it('覆盖资源目录 Loading、Empty、Error 和成功重试状态', async () => {
    const memoryGateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const originalGetResources = memoryGateway.getResources.bind(memoryGateway)
    let resolveCatalog: ((catalog: ResourceCatalog) => void) | undefined
    const catalogPromise = new Promise<ResourceCatalog>((resolve) => {
      resolveCatalog = resolve
    })
    vi.spyOn(memoryGateway, 'getResources').mockReturnValueOnce(catalogPromise)

    const loadingView = renderCreate({ gateway: memoryGateway })
    expect(
      await screen.findByText('正在加载可申请资源…'),
    ).toBeInTheDocument()
    resolveCatalog?.(await originalGetResources())
    expect(await screen.findByLabelText('目标资源')).toBeInTheDocument()
    loadingView.view.unmount()

    const emptyGateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    vi.spyOn(emptyGateway, 'getResources').mockResolvedValue({
      permissions: [],
      resources: [],
    })
    renderCreate({ gateway: emptyGateway })
    expect(
      await screen.findByText('暂无可申请的目标资源。'),
    ).toBeInTheDocument()

    const retryGateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const retryOriginal = retryGateway.getResources.bind(retryGateway)
    vi.spyOn(retryGateway, 'getResources')
      .mockRejectedValueOnce(new Error('目录暂时不可用'))
      .mockImplementation(retryOriginal)
    renderCreate({ gateway: retryGateway })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '无法加载资源目录',
    )
    await userEvent.click(screen.getByRole('button', { name: '重试加载' }))
    expect(await screen.findByLabelText('目标资源')).toBeInTheDocument()
  })

  it('关联全部字段错误并把焦点移动到首个无效字段', async () => {
    const user = userEvent.setup()
    renderCreate()

    await user.click(
      await screen.findByRole('button', { name: '提交权限申请' }),
    )

    const resourceField = screen.getByLabelText('目标资源')
    expect(resourceField).toHaveFocus()
    expect(resourceField).toHaveAttribute('aria-invalid', 'true')
    expect(resourceField).toHaveAccessibleDescription('请选择目标资源')
    expect(screen.getByLabelText('请求的权限级别')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByLabelText('访问截止日期')).toHaveAccessibleDescription(
      '请选择访问截止日期',
    )
    expect(screen.getByLabelText('申请原因')).toHaveAccessibleDescription(
      '请填写申请原因',
    )
  })

  it('由任一员工连续提交四个输入，并使用 Gateway 返回的 Pending 结果确认详情', async () => {
    const user = userEvent.setup()
    const memoryGateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const createRequest = vi.spyOn(memoryGateway, 'createAccessRequest')
    const getDetails = vi.spyOn(memoryGateway, 'getAccessRequest')
    const { view } = renderCreate({
      gateway: memoryGateway,
      storedUserId: 'user-bob',
    })

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: '提交权限申请' }))

    expect(
      await screen.findByRole('status', { name: '创建成功' }),
    ).toHaveTextContent('申请已创建成功')
    expect(
      screen.getByRole('heading', { name: '权限申请详情' }),
    ).toHaveFocus()
    expect(screen.getByText('当前状态：待审批（Pending）')).toBeInTheDocument()
    expect(screen.getByText('风险等级：高风险（High）')).toBeInTheDocument()
    expect(screen.getByText('负责审批员工 ID：user-carol')).toBeInTheDocument()
    expect(screen.getByText('申请版本：1')).toBeInTheDocument()
    expect(createRequest).toHaveBeenCalledWith({
      actorId: 'user-bob',
      resourceId: 'resource-analytics',
      permissionId: 'permission-manage',
      accessUntil: '2099-10-01',
      reason: '排查季度报表数据问题',
    })
    expect(createRequest.mock.calls[0]?.[0]).not.toHaveProperty('riskLevel')
    expect(createRequest.mock.calls[0]?.[0]).not.toHaveProperty('approverId')
    expect(createRequest.mock.calls[0]?.[0]).not.toHaveProperty('status')
    expect(createRequest.mock.calls[0]?.[0]).not.toHaveProperty('revision')
    expect(getDetails).not.toHaveBeenCalled()

    view.unmount()
    renderCreate({
      gateway: memoryGateway,
      initialEntry: '/requests/request-created-by-contract',
      storedUserId: 'user-bob',
    })
    expect(await screen.findByText('当前状态：待审批（Pending）')).toBeInTheDocument()
    expect(getDetails).toHaveBeenCalledOnce()
  })

  it('提交期间禁用按钮并阻止重复创建', async () => {
    const user = userEvent.setup()
    const memoryGateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const originalCreate = memoryGateway.createAccessRequest.bind(memoryGateway)
    let releaseCreate: (() => void) | undefined
    const createGate = new Promise<void>((resolve) => {
      releaseCreate = resolve
    })
    const createRequest = vi
      .spyOn(memoryGateway, 'createAccessRequest')
      .mockImplementation(async (command) => {
        await createGate
        return originalCreate(command)
      })
    renderCreate({ gateway: memoryGateway })
    await fillValidForm(user)

    const submitButton = screen.getByRole('button', {
      name: '提交权限申请',
    })
    await user.click(submitButton)

    expect(
      await screen.findByRole('button', { name: '正在提交…' }),
    ).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '正在提交…' }))
    expect(createRequest).toHaveBeenCalledOnce()
    releaseCreate?.()
    expect(await screen.findByText('当前状态：待审批（Pending）')).toBeInTheDocument()
  })

  it('瞬时失败不产生记录，保留输入并允许显式重试', async () => {
    const user = userEvent.setup()
    const memoryGateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const faultController = new DeterministicFaultController()
    faultController.failNext('createAccessRequest')
    const gateway = new DemoTransport(memoryGateway, {
      faultController,
      mutationDelayMs: 0,
      queryDelayMs: 0,
    })
    renderCreate({ gateway })
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: '提交权限申请' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '提交暂时失败，请重试',
    )
    expect(screen.getByLabelText('目标资源')).toHaveValue(
      'resource-analytics',
    )
    expect(screen.getByLabelText('请求的权限级别')).toHaveValue(
      'permission-manage',
    )
    expect(screen.getByLabelText('访问截止日期')).toHaveValue('2099-10-01')
    expect(screen.getByLabelText('申请原因')).toHaveValue(
      '排查季度报表数据问题',
    )
    await expect(
      memoryGateway.getAccessRequest({
        requestId: accessRequestIdSchema.parse('request-created-by-contract'),
        viewerId: demoUserIdSchema.parse('user-alice'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    await user.click(screen.getByRole('button', { name: '重新提交' }))

    expect(await screen.findByText('当前状态：待审批（Pending）')).toBeInTheDocument()
    expect(
      await memoryGateway.getAccessRequest({
        requestId: accessRequestIdSchema.parse('request-created-by-contract'),
        viewerId: demoUserIdSchema.parse('user-alice'),
      }),
    ).toMatchObject({ request: { status: 'Pending' } })
  })
})
