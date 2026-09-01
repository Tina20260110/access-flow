import { describe, expect, it } from 'vitest'

import { type AccessFlowErrorCode } from '../../domain/errors'
import {
  accessRequestIdSchema,
  demoUserIdSchema,
} from '../../domain/schemas'
import { gatewayContractRuntime } from '../../test/gateway-contract'
import { MemoryAccessFlowGateway } from '../../test/memory-gateway'

const aliceId = demoUserIdSchema.parse('user-alice')
const bobId = demoUserIdSchema.parse('user-bob')
const carolId = demoUserIdSchema.parse('user-carol')
const danaId = demoUserIdSchema.parse('user-dana')

async function expectGatewayError(
  operation: Promise<unknown>,
  code: AccessFlowErrorCode,
): Promise<void> {
  await operation.then(
    () => expect.fail(`操作应返回 ${code}`),
    (error: unknown) => {
      expect(error).toMatchObject({ code })
    },
  )
}

describe('申请详情 Gateway 语义', () => {
  it('只向申请人和负责审批员工返回同一份完整详情', async () => {
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })
    const requestId = accessRequestIdSchema.parse('request-pending-high')

    const requesterView = await gateway.getAccessRequest({
      requestId,
      viewerId: aliceId,
    })
    const approverView = await gateway.getAccessRequest({
      requestId,
      viewerId: bobId,
    })

    expect(requesterView).toEqual(approverView)
    expect(requesterView).toMatchObject({
      requester: { id: aliceId, displayName: 'Alice Chen' },
      approver: { id: bobId, displayName: 'Bob Li' },
      resource: {
        id: 'resource-analytics',
        displayName: '数据分析平台',
      },
      permission: {
        id: 'permission-manage',
        displayName: '管理访问',
      },
      request: {
        id: requestId,
        requesterId: aliceId,
        approverId: bobId,
      },
    })
  })

  it('对不可见的既有申请与未知申请统一返回 NOT_FOUND', async () => {
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })

    await expectGatewayError(
      gateway.getAccessRequest({
        requestId: accessRequestIdSchema.parse('request-pending-high'),
        viewerId: danaId,
      }),
      'NOT_FOUND',
    )
    await expectGatewayError(
      gateway.getAccessRequest({
        requestId: accessRequestIdSchema.parse('request-does-not-exist'),
        viewerId: danaId,
      }),
      'NOT_FOUND',
    )
  })

  it('返回与 Pending、Approved、Rejected 判别状态一致的审批记录', async () => {
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })

    const pending = await gateway.getAccessRequest({
      requestId: accessRequestIdSchema.parse('request-pending-high'),
      viewerId: aliceId,
    })
    const approved = await gateway.getAccessRequest({
      requestId: accessRequestIdSchema.parse('request-approved-low'),
      viewerId: bobId,
    })
    const rejected = await gateway.getAccessRequest({
      requestId: accessRequestIdSchema.parse('request-rejected-high'),
      viewerId: carolId,
    })

    expect(pending.request).toMatchObject({
      status: 'Pending',
      approvalRecord: null,
      revision: 1,
    })
    expect(approved.request).toMatchObject({
      status: 'Approved',
      approvalRecord: {
        outcome: 'Approved',
        approverId: aliceId,
      },
      revision: 2,
    })
    expect(rejected.request).toMatchObject({
      status: 'Rejected',
      approvalRecord: {
        outcome: 'Rejected',
        approverId: aliceId,
        rejectionReason: '缺少已批准的变更单',
      },
      revision: 2,
    })
  })
})
