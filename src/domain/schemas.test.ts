import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  AccessRequest,
  DemoUserId,
  PersistedDemoState,
} from './models'
import {
  accessRequestSchema,
  dateOnlySchema,
  demoUserIdSchema,
  demoUserSchema,
  isoDateTimeSchema,
  persistedDemoStateSchema,
  resourceSchema,
} from './schemas'

function createValidState(): unknown {
  return {
    schemaVersion: 1,
    users: [
      { id: 'user-alice', displayName: 'Alice' },
      { id: 'user-bob', displayName: 'Bob' },
      { id: 'user-carol', displayName: 'Carol' },
    ],
    permissions: [
      { id: 'permission-read', displayName: '只读' },
      { id: 'permission-admin', displayName: '管理' },
    ],
    resources: [
      {
        id: 'resource-console',
        displayName: '管理后台',
        permissionRules: [
          { permissionId: 'permission-read', riskLevel: 'Low' },
          { permissionId: 'permission-admin', riskLevel: 'High' },
        ],
        approverCandidateIds: ['user-bob', 'user-carol'],
      },
    ],
    accessRequests: [
      {
        id: 'request-pending',
        requesterId: 'user-alice',
        approverId: 'user-bob',
        resourceId: 'resource-console',
        permissionId: 'permission-read',
        accessUntil: '2026-10-10',
        reason: '排查生产问题',
        riskLevel: 'Low',
        createdAt: '2026-09-01T00:00:00.000Z',
        revision: 1,
        status: 'Pending',
        approvalRecord: null,
      },
      {
        id: 'request-approved',
        requesterId: 'user-alice',
        approverId: 'user-carol',
        resourceId: 'resource-console',
        permissionId: 'permission-admin',
        accessUntil: '2026-11-10',
        reason: '发布新版本',
        riskLevel: 'High',
        createdAt: '2026-09-01T00:00:00.000Z',
        revision: 2,
        status: 'Approved',
        approvalRecord: {
          outcome: 'Approved',
          approverId: 'user-carol',
          decidedAt: '2026-09-02T00:00:00.000Z',
        },
      },
      {
        id: 'request-rejected',
        requesterId: 'user-bob',
        approverId: 'user-carol',
        resourceId: 'resource-console',
        permissionId: 'permission-admin',
        accessUntil: '2026-12-10',
        reason: '临时维护',
        riskLevel: 'High',
        createdAt: '2026-09-01T00:00:00.000Z',
        revision: 2,
        status: 'Rejected',
        approvalRecord: {
          outcome: 'Rejected',
          approverId: 'user-carol',
          decidedAt: '2026-09-02T00:00:00.000Z',
          rejectionReason: '缺少变更单',
        },
      },
    ],
  }
}

function cloneValidState(): Record<string, unknown> {
  return structuredClone(createValidState()) as Record<string, unknown>
}

describe('基础值 schema', () => {
  it('只在校验后产生品牌 ID，并规范首尾空白', () => {
    const id = demoUserIdSchema.parse(' user-alice ')

    expect(id).toBe('user-alice')
    expectTypeOf(id).toEqualTypeOf<DemoUserId>()
    expect(demoUserIdSchema.safeParse('   ').success).toBe(false)
  })

  it('只接受真实日历日期和 UTC ISO 时间', () => {
    expect(dateOnlySchema.safeParse('2024-02-29').success).toBe(true)
    expect(dateOnlySchema.safeParse('2025-02-29').success).toBe(false)
    expect(dateOnlySchema.safeParse('2026-2-01').success).toBe(false)
    expect(
      isoDateTimeSchema.safeParse('2026-09-01T08:30:00.000Z').success,
    ).toBe(true)
    expect(
      isoDateTimeSchema.safeParse('2026-09-01T16:30:00+08:00').success,
    ).toBe(false)
  })

  it('DemoUser 只有员工基础身份字段', () => {
    expect(
      demoUserSchema.parse({ id: 'user-alice', displayName: ' Alice ' }),
    ).toEqual({ id: 'user-alice', displayName: 'Alice' })
    expect(
      demoUserSchema.safeParse({
        id: 'user-alice',
        displayName: 'Alice',
        roles: ['Approver'],
      }).success,
    ).toBe(false)
  })
})

describe('申请状态判别联合', () => {
  it('接受 Pending、Approved、Rejected 三种合法状态', () => {
    const state = persistedDemoStateSchema.parse(createValidState())

    expect(state.accessRequests.map((request) => request.status)).toEqual([
      'Pending',
      'Approved',
      'Rejected',
    ])
    expectTypeOf(state.accessRequests[0]).toExtend<
      AccessRequest | undefined
    >()
  })

  it('拒绝状态与审批记录不一致的非法组合', () => {
    const invalidPending = {
      ...(persistedDemoStateSchema.parse(createValidState())
        .accessRequests[0] ?? {}),
      status: 'Pending',
      approvalRecord: {
        outcome: 'Approved',
        approverId: 'user-bob',
        decidedAt: '2026-09-02T00:00:00.000Z',
      },
    }

    expect(accessRequestSchema.safeParse(invalidPending).success).toBe(false)
    expect(
      accessRequestSchema.safeParse({ ...invalidPending, approvalRecord: null, revision: 2 })
        .success,
    ).toBe(false)
  })

  it('拒绝自审批和终态审批人不一致', () => {
    const validRequest = persistedDemoStateSchema.parse(createValidState())
      .accessRequests[1]
    if (!validRequest) throw new Error('测试 fixture 必须包含终态申请')

    expect(
      accessRequestSchema.safeParse({
        ...validRequest,
        approverId: validRequest.requesterId,
      }).success,
    ).toBe(false)
    expect(
      accessRequestSchema.safeParse({
        ...validRequest,
        approvalRecord: {
          outcome: 'Approved',
          approverId: 'user-bob',
          decidedAt: '2026-09-02T00:00:00.000Z',
        },
      }).success,
    ).toBe(false)
  })
})

describe('PersistedDemoState 根级关系校验', () => {
  it('返回完整可信的只读领域状态', () => {
    const state = persistedDemoStateSchema.parse(createValidState())

    expectTypeOf(state).toExtend<PersistedDemoState>()
    expect(state.resources[0]?.permissionRules).toHaveLength(2)
  })

  it('拒绝未知 schemaVersion 和损坏引用', () => {
    const wrongVersion = cloneValidState()
    wrongVersion['schemaVersion'] = 2

    const brokenReference = cloneValidState()
    const requests = brokenReference['accessRequests'] as Record<
      string,
      unknown
    >[]
    if (requests[0]) requests[0]['requesterId'] = 'missing-user'

    expect(persistedDemoStateSchema.safeParse(wrongVersion).success).toBe(false)
    expect(persistedDemoStateSchema.safeParse(brokenReference).success).toBe(
      false,
    )
  })

  it('拒绝重复目录 ID、重复规则和无足够审批候选人的资源', () => {
    const duplicateUser = cloneValidState()
    const users = duplicateUser['users'] as Record<string, unknown>[]
    users.push({ id: 'user-alice', displayName: '重复员工' })

    const duplicateRule = cloneValidState()
    const duplicateRuleResources = duplicateRule['resources'] as Record<
      string,
      unknown
    >[]
    const firstResource = duplicateRuleResources[0]
    if (firstResource) {
      firstResource['permissionRules'] = [
        { permissionId: 'permission-read', riskLevel: 'Low' },
        { permissionId: 'permission-read', riskLevel: 'Medium' },
      ]
    }

    const insufficientCandidates = cloneValidState()
    const resources = insufficientCandidates['resources'] as Record<
      string,
      unknown
    >[]
    if (resources[0]) resources[0]['approverCandidateIds'] = ['user-bob']

    expect(persistedDemoStateSchema.safeParse(duplicateUser).success).toBe(
      false,
    )
    expect(persistedDemoStateSchema.safeParse(duplicateRule).success).toBe(
      false,
    )
    expect(
      persistedDemoStateSchema.safeParse(insufficientCandidates).success,
    ).toBe(false)
  })

  it('拒绝不存在的资源权限组合', () => {
    const state = cloneValidState()
    const requests = state['accessRequests'] as Record<string, unknown>[]
    if (requests[0]) requests[0]['permissionId'] = 'permission-admin-missing'

    expect(persistedDemoStateSchema.safeParse(state).success).toBe(false)
  })
})

describe('Resource schema', () => {
  it('拒绝空风险规则或空审批候选列表', () => {
    expect(
      resourceSchema.safeParse({
        id: 'resource-console',
        displayName: '管理后台',
        permissionRules: [],
        approverCandidateIds: [],
      }).success,
    ).toBe(false)
  })
})
