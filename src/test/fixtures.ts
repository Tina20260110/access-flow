import { createSeedState } from '../data/seed-data'
import type { PersistedDemoState } from '../domain/models'
import { parsePersistedDemoState } from '../domain/schemas'
import { GATEWAY_CONTRACT_TODAY } from './gateway-contract'

function riskFields(index: number) {
  switch (index % 3) {
    case 0:
      return {
        permissionId: 'permission-read',
        riskLevel: 'Low',
      } as const
    case 1:
      return {
        permissionId: 'permission-contribute',
        riskLevel: 'Medium',
      } as const
    default:
      return {
        permissionId: 'permission-manage',
        riskLevel: 'High',
      } as const
  }
}

function statusFields(index: number, approverId: string) {
  switch (Math.floor(index / 3) % 3) {
    case 0:
      return {
        revision: 1,
        status: 'Pending',
        approvalRecord: null,
      } as const
    case 1:
      return {
        revision: 2,
        status: 'Approved',
        approvalRecord: {
          outcome: 'Approved',
          approverId,
          decidedAt: '2026-08-31T09:00:00.000Z',
        },
      } as const
    default:
      return {
        revision: 2,
        status: 'Rejected',
        approvalRecord: {
          outcome: 'Rejected',
          approverId,
          decidedAt: '2026-08-31T09:00:00.000Z',
          rejectionReason: '代表性规模测试拒绝原因',
        },
      } as const
  }
}

export function createScaleFixtureState(count = 1_000): PersistedDemoState {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('规模 fixture 数量必须是正整数')
  }

  const seed = createSeedState(GATEWAY_CONTRACT_TODAY)
  const accessRequests = Array.from({ length: count }, (_, index) => {
    const requesterId = index % 2 === 0 ? 'user-alice' : 'user-bob'
    const approverId = index % 2 === 0 ? 'user-bob' : 'user-alice'
    const createdAt = new Date(
      Date.UTC(2026, 7, 31, 8) - Math.floor(index / 2) * 1_000,
    ).toISOString()

    return {
      id: `request-scale-${String(index).padStart(4, '0')}`,
      requesterId,
      approverId,
      resourceId: 'resource-analytics',
      ...riskFields(index),
      accessUntil: '2026-10-01',
      reason: `代表性规模申请 ${String(index)}`,
      createdAt,
      ...statusFields(index, approverId),
    }
  })

  return parsePersistedDemoState({
    ...seed,
    accessRequests,
  })
}
