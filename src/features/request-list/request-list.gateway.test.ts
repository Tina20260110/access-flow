import { describe, expect, it } from 'vitest'

import type { ListQueryState, PersistedDemoState } from '../../domain/models'
import {
  accessRequestIdSchema,
  demoUserIdSchema,
  parsePersistedDemoState,
} from '../../domain/schemas'
import { createSeedState } from '../../data/seed-data'
import {
  GATEWAY_CONTRACT_TODAY,
  gatewayContractRuntime,
} from '../../test/gateway-contract'
import { MemoryAccessFlowGateway } from '../../test/memory-gateway'

const aliceId = demoUserIdSchema.parse('user-alice')

const defaultQuery: ListQueryState = {
  search: '',
  status: null,
  riskLevel: null,
  page: 1,
}

function createStablePaginationState(): PersistedDemoState {
  const seed = createSeedState(GATEWAY_CONTRACT_TODAY)
  const accessRequests = Array.from({ length: 12 }, (_, index) => {
    const order = String(12 - index).padStart(2, '0')

    return {
      id: `request-list-${order}`,
      requesterId: 'user-bob',
      approverId: 'user-alice',
      resourceId: 'resource-knowledge',
      permissionId: 'permission-read',
      accessUntil: '2026-10-01',
      reason: `稳定分页申请 ${order}`,
      riskLevel: 'Low',
      createdAt: '2026-08-20T08:00:00.000Z',
      revision: 1,
      status: 'Pending',
      approvalRecord: null,
    } satisfies Record<string, unknown>
  })

  return parsePersistedDemoState({
    ...seed,
    accessRequests,
  })
}

describe('申请列表 Gateway 语义', () => {
  it('按 requester/approver 关系并集返回唯一记录，并组合名称搜索与筛选', async () => {
    const gateway = new MemoryAccessFlowGateway({
      runtime: gatewayContractRuntime,
    })

    const visible = await gateway.listAccessRequests({
      viewerId: aliceId,
      query: defaultQuery,
    })
    const requesterSearch = await gateway.listAccessRequests({
      viewerId: aliceId,
      query: { ...defaultQuery, search: '  aLiCe  ' },
    })
    const combined = await gateway.listAccessRequests({
      viewerId: aliceId,
      query: {
        search: '部署',
        status: 'Rejected',
        riskLevel: 'High',
        page: 1,
      },
    })

    expect(new Set(visible.items.map((request) => request.id)).size).toBe(
      visible.items.length,
    )
    expect(visible.items.map((request) => request.id)).toEqual([
      'request-pending-high',
      'request-expired-low',
      'request-rejected-high',
      'request-approved-low',
    ])
    expect(requesterSearch.items.map((request) => request.id)).toEqual([
      'request-pending-high',
    ])
    expect(combined.items.map((request) => request.id)).toEqual([
      'request-rejected-high',
    ])
  })

  it('按创建时间和 ID 稳定排序，固定分页并把越界页回退到最后一页', async () => {
    const gateway = new MemoryAccessFlowGateway({
      initialState: createStablePaginationState(),
      runtime: gatewayContractRuntime,
    })

    const firstPage = await gateway.listAccessRequests({
      viewerId: aliceId,
      query: defaultQuery,
    })
    const overflowPage = await gateway.listAccessRequests({
      viewerId: aliceId,
      query: { ...defaultQuery, page: 99 },
    })
    const emptyPage = await gateway.listAccessRequests({
      viewerId: aliceId,
      query: { ...defaultQuery, search: '不存在的资源' },
    })

    expect(firstPage).toMatchObject({
      page: 1,
      pageSize: 10,
      totalItems: 12,
      totalPages: 2,
    })
    expect(firstPage.items.map((request) => request.id)).toEqual(
      Array.from({ length: 10 }, (_, index) =>
        accessRequestIdSchema.parse(
          `request-list-${String(index + 1).padStart(2, '0')}`,
        ),
      ),
    )
    expect(overflowPage).toMatchObject({ page: 2, totalPages: 2 })
    expect(overflowPage.items.map((request) => request.id)).toEqual([
      'request-list-11',
      'request-list-12',
    ])
    expect(emptyPage).toMatchObject({
      items: [],
      page: 1,
      totalItems: 0,
      totalPages: 0,
    })
  })
})
