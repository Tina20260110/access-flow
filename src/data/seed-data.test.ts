import { describe, expect, expectTypeOf, it } from 'vitest'

import type { PersistedDemoState } from '../domain/models'
import { assignApproverId } from '../domain/request-rules'
import { dateOnlySchema, persistedDemoStateSchema } from '../domain/schemas'
import { createSeedState, DEFAULT_DEMO_USER_ID } from './seed-data'

const today = dateOnlySchema.parse('2026-09-01')

describe('createSeedState', () => {
  it('相同业务日期生成确定性的可信根状态', () => {
    const first = createSeedState(today)
    const second = createSeedState(today)

    expect(first).toEqual(second)
    expect(persistedDemoStateSchema.safeParse(first).success).toBe(true)
    expectTypeOf(first).toExtend<PersistedDemoState>()
  })

  it('包含三种状态和三种风险等级的代表性申请', () => {
    const state = createSeedState(today)

    expect(new Set(state.accessRequests.map((request) => request.status))).toEqual(
      new Set(['Pending', 'Approved', 'Rejected']),
    )
    expect(
      new Set(state.accessRequests.map((request) => request.riskLevel)),
    ).toEqual(new Set(['Low', 'Medium', 'High']))
  })

  it('DemoUser 只有基础员工身份且默认员工存在', () => {
    const state = createSeedState(today)

    expect(state.users.length).toBeGreaterThanOrEqual(3)
    expect(state.users.some((user) => user.id === DEFAULT_DEMO_USER_ID)).toBe(
      true,
    )
    expect(state.users.every((user) => !('roles' in user))).toBe(true)
    expect(state.users.every((user) => !('role' in user))).toBe(true)
  })

  it('每个资源都有至少两位有效且不同的审批候选员工', () => {
    const state = createSeedState(today)
    const userIds = new Set(state.users.map((user) => user.id))

    for (const resource of state.resources) {
      expect(resource.approverCandidateIds.length).toBeGreaterThanOrEqual(2)
      expect(new Set(resource.approverCandidateIds).size).toBe(
        resource.approverCandidateIds.length,
      )
      expect(
        resource.approverCandidateIds.every((candidateId) =>
          userIds.has(candidateId),
        ),
      ).toBe(true)
    }
  })

  it('所有申请都避免自审批并遵循资源的确定性分配顺序', () => {
    const state = createSeedState(today)

    for (const request of state.accessRequests) {
      const resource = state.resources.find(
        (candidate) => candidate.id === request.resourceId,
      )
      expect(resource).toBeDefined()
      if (!resource) continue

      expect(request.requesterId).not.toBe(request.approverId)
      expect(request.approverId).toBe(
        assignApproverId(resource, request.requesterId),
      )
    }
  })

  it('提供可验证到期批准规则的 Pending 申请', () => {
    const state = createSeedState(today)
    const expiredPending = state.accessRequests.find(
      (request) =>
        request.status === 'Pending' && request.accessUntil <= today,
    )

    expect(expiredPending).toBeDefined()
  })
})
