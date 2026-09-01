import { afterEach, describe, expect, it, vi } from 'vitest'

import { AccessFlowError } from '../domain/errors'
import {
  dateOnlySchema,
  demoUserIdSchema,
  permissionIdSchema,
  resourceIdSchema,
} from '../domain/schemas'
import { MemoryAccessFlowGateway } from '../test/memory-gateway'
import { gatewayContractRuntime } from '../test/gateway-contract'
import {
  DemoTransport,
  DeterministicFaultController,
} from './demo-transport'

const aliceId = demoUserIdSchema.parse('user-alice')

describe('DemoTransport', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('在查询延迟结束前不启动底层 Gateway', async () => {
    vi.useFakeTimers()
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const getUsers = vi.spyOn(gateway, 'getDemoUsers')
    const transport = new DemoTransport(gateway, {
      queryDelayMs: 200,
      mutationDelayMs: 350,
    })

    const result = transport.getDemoUsers()
    expect(getUsers).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(199)
    expect(getUsers).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toHaveLength(4)
    expect(getUsers).toHaveBeenCalledOnce()
  })

  it('在变更延迟结束前不启动底层写事务', async () => {
    vi.useFakeTimers()
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const createRequest = vi.spyOn(gateway, 'createAccessRequest')
    const transport = new DemoTransport(gateway, {
      queryDelayMs: 200,
      mutationDelayMs: 350,
    })

    const result = transport.createAccessRequest({
      actorId: aliceId,
      resourceId: resourceIdSchema.parse('resource-analytics'),
      permissionId: permissionIdSchema.parse('permission-read'),
      accessUntil: dateOnlySchema.parse('2026-10-01'),
      reason: '验证变更延迟边界',
    })
    await vi.advanceTimersByTimeAsync(349)
    expect(createRequest).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toMatchObject({ status: 'Pending' })
    expect(createRequest).toHaveBeenCalledOnce()
  })

  it('测试环境可配置零延迟', async () => {
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const transport = new DemoTransport(gateway, {
      queryDelayMs: 0,
      mutationDelayMs: 0,
    })

    await expect(transport.getDemoUsers()).resolves.toHaveLength(4)
  })

  it('确定性失败只命中下一次指定操作且不改变数据', async () => {
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const createRequest = vi.spyOn(gateway, 'createAccessRequest')
    const faults = new DeterministicFaultController()
    const transport = new DemoTransport(gateway, {
      queryDelayMs: 0,
      mutationDelayMs: 0,
      faultController: faults,
    })
    faults.failNext('createAccessRequest')

    await expect(transport.getDemoUsers()).resolves.toHaveLength(4)
    const command = {
      actorId: aliceId,
      resourceId: resourceIdSchema.parse('resource-analytics'),
      permissionId: permissionIdSchema.parse('permission-read'),
      accessUntil: dateOnlySchema.parse('2026-10-01'),
      reason: '第一次由 Transport 拦截',
    }

    await transport.createAccessRequest(command).then(
      () => expect.fail('预设失败不应执行底层 Gateway'),
      (error: unknown) => {
        expect(error).toBeInstanceOf(AccessFlowError)
        expect(error).toMatchObject({ code: 'TRANSIENT_FAILURE' })
      },
    )
    expect(createRequest).not.toHaveBeenCalled()

    await expect(
      transport.createAccessRequest(command),
    ).resolves.toMatchObject({ status: 'Pending' })
    expect(createRequest).toHaveBeenCalledOnce()
  })
})
