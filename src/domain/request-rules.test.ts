import { describe, expect, it } from 'vitest'

import { AccessFlowError } from './errors'
import { assignApproverId, resolveRiskLevel } from './request-rules'
import {
  demoUserIdSchema,
  permissionIdSchema,
  resourceSchema,
} from './schemas'

const aliceId = demoUserIdSchema.parse('user-alice')
const bobId = demoUserIdSchema.parse('user-bob')
const carolId = demoUserIdSchema.parse('user-carol')
const readPermissionId = permissionIdSchema.parse('permission-read')
const adminPermissionId = permissionIdSchema.parse('permission-admin')

const resource = resourceSchema.parse({
  id: 'resource-console',
  displayName: '管理后台',
  permissionRules: [
    { permissionId: readPermissionId, riskLevel: 'Low' },
    { permissionId: adminPermissionId, riskLevel: 'High' },
  ],
  approverCandidateIds: [bobId, aliceId, carolId],
})

function expectErrorCode(action: () => unknown, code: AccessFlowError['code']) {
  try {
    action()
    expect.unreachable('预期领域规则抛出错误')
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(AccessFlowError)
    if (error instanceof AccessFlowError) expect(error.code).toBe(code)
  }
}

describe('resolveRiskLevel', () => {
  it('只按资源权限精确映射返回风险', () => {
    expect(resolveRiskLevel(resource, readPermissionId)).toBe('Low')
    expect(resolveRiskLevel(resource, adminPermissionId)).toBe('High')
  })

  it('未映射的权限不使用默认风险', () => {
    const missingPermissionId = permissionIdSchema.parse('permission-missing')

    expectErrorCode(
      () => resolveRiskLevel(resource, missingPermissionId),
      'UNMAPPED_PERMISSION',
    )
  })
})

describe('assignApproverId', () => {
  it('按候选顺序选择第一位非申请人员工', () => {
    expect(assignApproverId(resource, aliceId)).toBe(bobId)
    expect(assignApproverId(resource, bobId)).toBe(aliceId)
  })

  it('没有非申请人候选时阻止创建', () => {
    const selfOnlyResource = resourceSchema.parse({
      ...resource,
      approverCandidateIds: [aliceId],
    })

    expectErrorCode(
      () => assignApproverId(selfOnlyResource, aliceId),
      'NO_ELIGIBLE_APPROVER',
    )
  })
})
