import { QueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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
import type { AccessFlowGateway } from '../../data/access-flow-gateway'
import {
  DEMO_USER_PREFERENCE_KEY,
  DemoPreferencesAdapter,
} from '../../data/demo-preferences'
import {
  DemoTransport,
  DeterministicFaultController,
} from '../../data/demo-transport'
import type {
  ApprovedAccessRequest,
  RejectedAccessRequest,
} from '../../domain/models'
import { gatewayContractRuntime } from '../../test/gateway-contract'
import { MemoryAccessFlowGateway } from '../../test/memory-gateway'
import { DemoIdentityProvider } from '../demo-identity/DemoIdentityProvider'

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
  storedUserId: string
}>

function TestRoot({
  children,
  gateway,
  initialEntry,
  queryClient,
  storedUserId,
}: TestRootProps) {
  const storage = new TestPreferenceStorage()
  storage.setItem(DEMO_USER_PREFERENCE_KEY, storedUserId)

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

function renderApproval(options: {
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
      storedUserId={options.storedUserId ?? 'user-bob'}
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

describe('申请审批流程', () => {
  it('仅按申请关系展示操作，终态隐藏操作，过期申请只能拒绝', async () => {
    const requesterView = renderApproval({ storedUserId: 'user-alice' })
    expect(await screen.findByText('待审批（Pending）')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '批准申请' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '拒绝申请' }),
    ).not.toBeInTheDocument()
    requesterView.view.unmount()

    const approverView = renderApproval()
    expect(
      await screen.findByRole('button', { name: '批准申请' }),
    ).toBeEnabled()
    expect(screen.getByRole('button', { name: '拒绝申请' })).toBeEnabled()
    approverView.view.unmount()

    const terminalView = renderApproval({
      initialEntry: '/requests/request-approved-low',
      storedUserId: 'user-alice',
    })
    expect(await screen.findByText('已批准（Approved）')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /批准申请|拒绝申请/ }),
    ).not.toBeInTheDocument()
    terminalView.view.unmount()

    const rejectedView = renderApproval({
      initialEntry: '/requests/request-rejected-high',
      storedUserId: 'user-alice',
    })
    expect(await screen.findByText('已拒绝（Rejected）')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /批准申请|拒绝申请/ }),
    ).not.toBeInTheDocument()
    rejectedView.view.unmount()

    const unrelatedView = renderApproval({ storedUserId: 'user-dana' })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '申请不存在或当前员工不可查看。',
    )
    expect(
      screen.queryByRole('button', { name: /批准申请|拒绝申请/ }),
    ).not.toBeInTheDocument()
    unrelatedView.view.unmount()

    renderApproval({
      initialEntry: '/requests/request-expired-low',
      storedUserId: 'user-alice',
    })
    expect(
      await screen.findByRole('button', { name: '批准申请' }),
    ).toBeDisabled()
    expect(screen.getByText('访问期限已到，不能批准；仍可拒绝。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '拒绝申请' })).toBeEnabled()
  })

  it('批准携带详情 revision、阻止快速重复点击且不做 optimistic update', async () => {
    const user = userEvent.setup()
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const originalApprove = gateway.approveAccessRequest.bind(gateway)
    const deferred = createDeferred<ApprovedAccessRequest>()
    const approve = vi
      .spyOn(gateway, 'approveAccessRequest')
      .mockReturnValueOnce(deferred.promise)
    const queryClient = createAccessFlowQueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    renderApproval({ gateway, queryClient })

    const approveButton = await screen.findByRole('button', {
      name: '批准申请',
    })
    await user.dblClick(approveButton)

    expect(approve).toHaveBeenCalledOnce()
    expect(approve).toHaveBeenCalledWith({
      actorId: 'user-bob',
      requestId: 'request-pending-high',
      expectedRevision: 1,
    })
    expect(screen.getByText('待审批（Pending）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '正在批准…' })).toBeDisabled()

    const command = approve.mock.calls[0]?.[0]
    if (!command) throw new Error('批准 command 应已提交')
    deferred.resolve(await originalApprove(command))

    expect(await screen.findByText('已批准（Approved）')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('申请已批准')
    expect(screen.getByText('审批结果：已批准')).toBeInTheDocument()
    expect(screen.getByText('2', { selector: 'dd' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /批准申请|拒绝申请/ }),
    ).not.toBeInTheDocument()
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: accessFlowQueryKeys.accessRequests.lists(),
    })
  })

  it('拒绝对话框关联错误、支持 Escape 与焦点恢复，并保留失败输入后重试', async () => {
    const user = userEvent.setup()
    const memoryGateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const faultController = new DeterministicFaultController()
    faultController.failNext('rejectAccessRequest')
    const gateway = new DemoTransport(memoryGateway, {
      faultController,
      mutationDelayMs: 0,
      queryDelayMs: 0,
    })
    const reject = vi.spyOn(gateway, 'rejectAccessRequest')
    renderApproval({ gateway })

    const rejectTrigger = await screen.findByRole('button', {
      name: '拒绝申请',
    })
    await user.click(rejectTrigger)
    const dialog = screen.getByRole('dialog', { name: '拒绝权限申请' })
    const reason = screen.getByLabelText('拒绝原因')
    expect(reason).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: '确认拒绝' })).toHaveFocus()
    await user.tab()
    expect(reason).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(dialog).not.toBeInTheDocument()
    expect(rejectTrigger).toHaveFocus()

    await user.click(rejectTrigger)
    await user.click(screen.getByRole('button', { name: '确认拒绝' }))
    expect(screen.getByLabelText('拒绝原因')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByLabelText('拒绝原因')).toHaveAccessibleDescription(
      '请填写拒绝原因',
    )

    await user.type(screen.getByLabelText('拒绝原因'), '  权限范围过大  ')
    await user.click(screen.getByRole('button', { name: '确认拒绝' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '拒绝暂时失败，请重试',
    )
    expect(screen.getByLabelText('拒绝原因')).toHaveValue('  权限范围过大  ')

    await user.click(screen.getByRole('button', { name: '重新拒绝' }))
    expect(await screen.findByText('已拒绝（Rejected）')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('权限范围过大')).toBeInTheDocument()
    expect(reject).toHaveBeenLastCalledWith({
      actorId: 'user-bob',
      requestId: 'request-pending-high',
      expectedRevision: 1,
      rejectionReason: '权限范围过大',
    })
  })

  it('批准瞬时失败不会自动重试，并保留显式重试入口', async () => {
    const user = userEvent.setup()
    const memoryGateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const faultController = new DeterministicFaultController()
    faultController.failNext('approveAccessRequest')
    const gateway = new DemoTransport(memoryGateway, {
      faultController,
      mutationDelayMs: 0,
      queryDelayMs: 0,
    })
    const approve = vi.spyOn(gateway, 'approveAccessRequest')
    renderApproval({ gateway })

    await user.click(
      await screen.findByRole('button', { name: '批准申请' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '批准暂时失败，请重试',
    )
    expect(approve).toHaveBeenCalledOnce()
    expect(screen.getByText('待审批（Pending）')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重试批准' }))
    expect(await screen.findByText('已批准（Approved）')).toBeInTheDocument()
    expect(approve).toHaveBeenCalledTimes(2)
  })

  it('拒绝提交期间阻止快速重复点击并只生成一个最终结果', async () => {
    const user = userEvent.setup()
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const originalReject = gateway.rejectAccessRequest.bind(gateway)
    const deferred = createDeferred<RejectedAccessRequest>()
    const reject = vi
      .spyOn(gateway, 'rejectAccessRequest')
      .mockReturnValueOnce(deferred.promise)
    renderApproval({ gateway })

    await user.click(
      await screen.findByRole('button', { name: '拒绝申请' }),
    )
    await user.type(screen.getByLabelText('拒绝原因'), '缺少审批依据')
    const submit = screen.getByRole('button', { name: '确认拒绝' })
    await user.dblClick(submit)

    expect(reject).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '正在拒绝…' })).toBeDisabled()
    expect(screen.getByText('待审批（Pending）')).toBeInTheDocument()

    const command = reject.mock.calls[0]?.[0]
    if (!command) throw new Error('拒绝 command 应已提交')
    deferred.resolve(await originalReject(command))

    expect(await screen.findByText('已拒绝（Rejected）')).toBeInTheDocument()
    expect(screen.getAllByText('审批结果：已拒绝')).toHaveLength(1)
  })

  it('stale client 收到 CONFLICT 后不重试决定，重取详情并聚焦提示', async () => {
    const user = userEvent.setup()
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const originalApprove = gateway.approveAccessRequest.bind(gateway)
    const approve = vi
      .spyOn(gateway, 'approveAccessRequest')
      .mockImplementationOnce(async (command) => {
        await originalApprove(command)
        return originalApprove(command)
      })
    const getDetails = vi.spyOn(gateway, 'getAccessRequest')
    const queryClient = createAccessFlowQueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    renderApproval({ gateway, queryClient })

    await user.click(
      await screen.findByRole('button', { name: '批准申请' }),
    )

    const conflict = await screen.findByRole('alert')
    expect(conflict).toHaveTextContent('申请已经发生变化或已被处理')
    expect(conflict).toHaveFocus()
    expect(await screen.findByText('已批准（Approved）')).toBeInTheDocument()
    expect(approve).toHaveBeenCalledOnce()
    expect(getDetails.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: accessFlowQueryKeys.accessRequests.lists(),
    })
    expect(
      screen.queryByRole('button', { name: /批准申请|拒绝申请/ }),
    ).not.toBeInTheDocument()
  })
})
