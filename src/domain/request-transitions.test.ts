import { describe, expect, it } from 'vitest'

import { AccessFlowError } from './errors'
import type {
  AccessRequest,
  ApproveAccessRequestCommand,
  DecisionTime,
  PendingAccessRequest,
  RejectAccessRequestCommand,
} from './models'
import {
  approveAccessRequest,
  canApproveRequest,
  canDecideRequest,
  rejectAccessRequest,
} from './request-transitions'
import {
  accessRequestIdSchema,
  accessRequestSchema,
  dateOnlySchema,
  demoUserIdSchema,
  isoDateTimeSchema,
} from './schemas'

const aliceId = demoUserIdSchema.parse('user-alice')
const bobId = demoUserIdSchema.parse('user-bob')
const carolId = demoUserIdSchema.parse('user-carol')

const pendingRequest = accessRequestSchema.parse({
  id: 'request-pending',
  requesterId: aliceId,
  approverId: bobId,
  resourceId: 'resource-console',
  permissionId: 'permission-admin',
  accessUntil: '2026-10-10',
  reason: '发布新版本',
  riskLevel: 'High',
  createdAt: '2026-09-01T00:00:00.000Z',
  revision: 1,
  status: 'Pending',
  approvalRecord: null,
})

if (pendingRequest.status !== 'Pending') {
  throw new Error('测试 fixture 必须为 Pending')
}

const decisionTime: DecisionTime = {
  date: dateOnlySchema.parse('2026-09-02'),
  timestamp: isoDateTimeSchema.parse('2026-09-02T01:00:00.000Z'),
}

function approveCommand(
  overrides: Partial<ApproveAccessRequestCommand> = {},
): ApproveAccessRequestCommand {
  return {
    actorId: bobId,
    requestId: pendingRequest.id,
    expectedRevision: 1,
    ...overrides,
  }
}

function rejectCommand(
  overrides: Partial<RejectAccessRequestCommand> = {},
): RejectAccessRequestCommand {
  return {
    actorId: bobId,
    requestId: pendingRequest.id,
    expectedRevision: 1,
    rejectionReason: '缺少变更单',
    ...overrides,
  }
}

function expectErrorCode(action: () => unknown, code: AccessFlowError['code']) {
  try {
    action()
    expect.unreachable('预期状态转换抛出错误')
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(AccessFlowError)
    if (error instanceof AccessFlowError) expect(error.code).toBe(code)
  }
}

describe('共享审批资格', () => {
  it('只有 Pending 申请的负责审批人可以作出决定', () => {
    expect(canDecideRequest(pendingRequest, bobId)).toBe(true)
    expect(canDecideRequest(pendingRequest, aliceId)).toBe(false)
    expect(canDecideRequest(pendingRequest, carolId)).toBe(false)

    const approved = approveAccessRequest(
      pendingRequest,
      approveCommand(),
      decisionTime,
    )
    expect(canDecideRequest(approved, bobId)).toBe(false)
  })

  it('即使上游构造出自审批关系，资格规则也拒绝', () => {
    const selfAssignedRequest: PendingAccessRequest = {
      ...pendingRequest,
      approverId: pendingRequest.requesterId,
    }

    expect(canDecideRequest(selfAssignedRequest, aliceId)).toBe(false)
    expectErrorCode(
      () =>
        rejectAccessRequest(
          selfAssignedRequest,
          rejectCommand({ actorId: aliceId }),
          decisionTime,
        ),
      'FORBIDDEN',
    )
  })

  it('批准资格额外要求截止日期晚于决定日', () => {
    expect(canApproveRequest(pendingRequest, bobId, decisionTime.date)).toBe(
      true,
    )
    expect(
      canApproveRequest(
        { ...pendingRequest, accessUntil: decisionTime.date },
        bobId,
        decisionTime.date,
      ),
    ).toBe(false)
    expect(canApproveRequest(pendingRequest, aliceId, decisionTime.date)).toBe(
      false,
    )
  })
})

describe('申请状态转换', () => {
  it('批准生成唯一匹配记录并递增 revision', () => {
    const approved = approveAccessRequest(
      pendingRequest,
      approveCommand(),
      decisionTime,
    )

    expect(approved).toEqual({
      ...pendingRequest,
      status: 'Approved',
      revision: 2,
      approvalRecord: {
        outcome: 'Approved',
        approverId: bobId,
        decidedAt: decisionTime.timestamp,
      },
    })
    expect(pendingRequest.status).toBe('Pending')
  })

  it('拒绝 trim 原因并生成匹配记录', () => {
    const rejected = rejectAccessRequest(
      pendingRequest,
      rejectCommand({ rejectionReason: '  缺少变更单  ' }),
      decisionTime,
    )

    expect(rejected.status).toBe('Rejected')
    expect(rejected.revision).toBe(2)
    expect(rejected.approvalRecord.rejectionReason).toBe('缺少变更单')
  })

  it('拒绝空白原因', () => {
    expectErrorCode(
      () =>
        rejectAccessRequest(
          pendingRequest,
          rejectCommand({ rejectionReason: '   ' }),
          decisionTime,
        ),
      'VALIDATION_ERROR',
    )
  })

  it('禁止非负责人，并与 capability predicate 保持相同资格结果', () => {
    expect(canDecideRequest(pendingRequest, carolId)).toBe(false)
    expectErrorCode(
      () =>
        approveAccessRequest(
          pendingRequest,
          approveCommand({ actorId: carolId }),
          decisionTime,
        ),
      'FORBIDDEN',
    )
  })

  it('到期申请不能批准但仍可拒绝', () => {
    const expiredRequest: PendingAccessRequest = {
      ...pendingRequest,
      accessUntil: decisionTime.date,
    }

    expectErrorCode(
      () =>
        approveAccessRequest(expiredRequest, approveCommand(), decisionTime),
      'EXPIRED_REQUEST',
    )
    expect(
      rejectAccessRequest(expiredRequest, rejectCommand(), decisionTime).status,
    ).toBe('Rejected')
  })

  it('stale revision 和终态重复处理都返回 CONFLICT', () => {
    expectErrorCode(
      () =>
        approveAccessRequest(
          pendingRequest,
          approveCommand({ expectedRevision: 2 }),
          decisionTime,
        ),
      'CONFLICT',
    )

    const approved: AccessRequest = approveAccessRequest(
      pendingRequest,
      approveCommand(),
      decisionTime,
    )
    expectErrorCode(
      () =>
        rejectAccessRequest(
          approved,
          rejectCommand({ expectedRevision: approved.revision }),
          decisionTime,
        ),
      'CONFLICT',
    )
  })

  it('command 指向其他申请时不会转换当前记录', () => {
    expectErrorCode(
      () =>
        approveAccessRequest(
          pendingRequest,
          approveCommand({
            requestId: accessRequestIdSchema.parse('request-other'),
          }),
          decisionTime,
        ),
      'NOT_FOUND',
    )
  })
})
