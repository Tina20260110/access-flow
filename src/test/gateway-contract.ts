import { afterEach, describe, expect, it } from 'vitest'

import type { AccessFlowErrorCode } from '../domain/errors'
import type {
  ListQueryState,
  PersistedDemoState,
} from '../domain/models'
import {
  accessRequestIdSchema,
  dateOnlySchema,
  demoUserIdSchema,
  parsePersistedDemoState,
  permissionIdSchema,
  resourceIdSchema,
} from '../domain/schemas'
import type {
  AccessFlowGateway,
  GatewayRuntime,
} from '../data/access-flow-gateway'
import { createSeedState } from '../data/seed-data'

export const GATEWAY_CONTRACT_TODAY = dateOnlySchema.parse('2026-09-01')

export const gatewayContractRuntime: GatewayRuntime = {
  now: () => new Date('2026-09-01T08:30:00.000Z'),
  createRequestId: () => 'request-created-by-contract',
}

export type GatewayContractContext = Readonly<{
  gateway: AccessFlowGateway
  cleanup?: () => Promise<void> | void
}>

export type GatewayContractFactory = (
  initialState?: PersistedDemoState,
) => Promise<GatewayContractContext> | GatewayContractContext

const aliceId = demoUserIdSchema.parse('user-alice')
const bobId = demoUserIdSchema.parse('user-bob')
const carolId = demoUserIdSchema.parse('user-carol')
const analyticsId = resourceIdSchema.parse('resource-analytics')
const deploymentId = resourceIdSchema.parse('resource-deployment')
const managePermissionId = permissionIdSchema.parse('permission-manage')
const contributePermissionId = permissionIdSchema.parse(
  'permission-contribute',
)

const defaultQuery: ListQueryState = {
  search: '',
  status: null,
  riskLevel: null,
  page: 1,
}

function expectErrorCode(error: unknown, code: AccessFlowErrorCode): void {
  expect(error).toMatchObject({ code })
}

function createPaginationState(): PersistedDemoState {
  const seed = createSeedState(GATEWAY_CONTRACT_TODAY)
  const requests = Array.from({ length: 12 }, (_, index) => {
    const order = String(index + 1).padStart(2, '0')
    return {
      id: `request-page-${order}`,
      requesterId: 'user-bob',
      approverId: 'user-alice',
      resourceId: 'resource-knowledge',
      permissionId: 'permission-read',
      accessUntil: '2026-10-01',
      reason: `分页契约申请 ${order}`,
      riskLevel: 'Low',
      createdAt: '2026-08-20T08:00:00.000Z',
      revision: 1,
      status: 'Pending',
      approvalRecord: null,
    } satisfies Record<string, unknown>
  })

  return parsePersistedDemoState({
    ...seed,
    accessRequests: requests,
  })
}

export function runAccessFlowGatewayContract(
  adapterName: string,
  factory: GatewayContractFactory,
): void {
  describe(`${adapterName} AccessFlowGateway contract`, () => {
    const cleanups: (() => Promise<void> | void)[] = []

    async function createGateway(
      initialState?: PersistedDemoState,
    ): Promise<AccessFlowGateway> {
      const context = await factory(initialState)
      if (context.cleanup) cleanups.push(context.cleanup)
      return context.gateway
    }

    afterEach(async () => {
      await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()))
    })

    it('返回无永久角色的可信目录', async () => {
      const gateway = await createGateway()

      const users = await gateway.getDemoUsers()
      const catalog = await gateway.getResources()

      expect(users).toHaveLength(4)
      expect(users.every((user) => Object.keys(user).length === 2)).toBe(true)
      expect(catalog.resources).toHaveLength(3)
      expect(
        catalog.resources.every(
          (resource) => resource.approverCandidateIds.length >= 2,
        ),
      ).toBe(true)
    })

    it('按 requester/approver 关系并集查询并组合搜索筛选', async () => {
      const gateway = await createGateway()

      const visible = await gateway.listAccessRequests({
        viewerId: aliceId,
        query: defaultQuery,
      })
      const filtered = await gateway.listAccessRequests({
        viewerId: aliceId,
        query: {
          search: '生产部署',
          status: 'Rejected',
          riskLevel: 'High',
          page: 1,
        },
      })
      const requesterSearch = await gateway.listAccessRequests({
        viewerId: aliceId,
        query: { ...defaultQuery, search: 'alice' },
      })

      expect(visible.items.map((item) => item.id)).toEqual([
        'request-pending-high',
        'request-expired-low',
        'request-rejected-high',
        'request-approved-low',
      ])
      expect(filtered.items.map((item) => item.id)).toEqual([
        'request-rejected-high',
      ])
      expect(requesterSearch.items.map((item) => item.id)).toEqual([
        'request-pending-high',
      ])
    })

    it('使用稳定排序和固定分页，并把越界页收敛到最后一页', async () => {
      const gateway = await createGateway(createPaginationState())

      const firstPage = await gateway.listAccessRequests({
        viewerId: aliceId,
        query: defaultQuery,
      })
      const overflowPage = await gateway.listAccessRequests({
        viewerId: aliceId,
        query: { ...defaultQuery, page: 99 },
      })

      expect(firstPage).toMatchObject({
        page: 1,
        pageSize: 10,
        totalItems: 12,
        totalPages: 2,
      })
      expect(firstPage.items.map((item) => item.id)).toEqual(
        Array.from({ length: 10 }, (_, index) =>
          accessRequestIdSchema.parse(
            `request-page-${String(index + 1).padStart(2, '0')}`,
          ),
        ),
      )
      expect(overflowPage.page).toBe(2)
      expect(overflowPage.items.map((item) => item.id)).toEqual([
        'request-page-11',
        'request-page-12',
      ])
    })

    it('只向申请关系参与者返回详情且不泄露记录是否存在', async () => {
      const gateway = await createGateway()
      const requestId = accessRequestIdSchema.parse('request-pending-high')

      await expect(
        gateway.getAccessRequest({ viewerId: aliceId, requestId }),
      ).resolves.toMatchObject({ request: { id: requestId } })
      await expect(
        gateway.getAccessRequest({ viewerId: bobId, requestId }),
      ).resolves.toMatchObject({ request: { id: requestId } })

      for (const hiddenRequestId of [
        requestId,
        accessRequestIdSchema.parse('request-does-not-exist'),
      ]) {
        await gateway
          .getAccessRequest({
            viewerId: carolId,
            requestId: hiddenRequestId,
          })
          .then(
            () => expect.fail('不可见或不存在的详情不应成功'),
            (error: unknown) => {
              expectErrorCode(error, 'NOT_FOUND')
            },
          )
      }
    })

    it('原子创建 Pending 申请并由资源规则决定风险和审批人', async () => {
      const gateway = await createGateway()

      const created = await gateway.createAccessRequest({
        actorId: aliceId,
        resourceId: analyticsId,
        permissionId: managePermissionId,
        accessUntil: dateOnlySchema.parse('2026-10-01'),
        reason: '  排查权限异常  ',
      })

      expect(created).toMatchObject({
        requesterId: aliceId,
        approverId: bobId,
        riskLevel: 'High',
        status: 'Pending',
        revision: 1,
        reason: '排查权限异常',
        approvalRecord: null,
      })
      await expect(
        gateway.getAccessRequest({
          viewerId: aliceId,
          requestId: created.id,
        }),
      ).resolves.toMatchObject({ request: created })
    })

    it('创建失败不留下部分写入', async () => {
      const gateway = await createGateway()
      const before = await gateway.listAccessRequests({
        viewerId: aliceId,
        query: defaultQuery,
      })

      await gateway
        .createAccessRequest({
          actorId: aliceId,
          resourceId: deploymentId,
          permissionId: contributePermissionId,
          accessUntil: dateOnlySchema.parse('2026-10-01'),
          reason: '未映射权限不应写入',
        })
        .then(
          () => expect.fail('未映射权限不应创建成功'),
          (error: unknown) => {
            expectErrorCode(error, 'UNMAPPED_PERMISSION')
          },
        )

      const after = await gateway.listAccessRequests({
        viewerId: aliceId,
        query: defaultQuery,
      })
      expect(after.totalItems).toBe(before.totalItems)
    })

    it('首个审批决定成功，旧 revision 冲突且不能覆盖终态', async () => {
      const gateway = await createGateway()
      const requestId = accessRequestIdSchema.parse('request-pending-high')

      const approved = await gateway.approveAccessRequest({
        actorId: bobId,
        requestId,
        expectedRevision: 1,
      })
      expect(approved).toMatchObject({ status: 'Approved', revision: 2 })

      await gateway
        .rejectAccessRequest({
          actorId: bobId,
          requestId,
          expectedRevision: 1,
          rejectionReason: '试图覆盖首个决定',
        })
        .then(
          () => expect.fail('旧 revision 不应覆盖终态'),
          (error: unknown) => {
            expectErrorCode(error, 'CONFLICT')
          },
        )

      const details = await gateway.getAccessRequest({
        viewerId: aliceId,
        requestId,
      })
      expect(details.request).toMatchObject({
        status: 'Approved',
        revision: 2,
      })
    })

    it('两个并发决定只有一个成功并形成唯一终态', async () => {
      const gateway = await createGateway()
      const requestId = accessRequestIdSchema.parse('request-pending-high')

      const decisions = await Promise.allSettled([
        gateway.approveAccessRequest({
          actorId: bobId,
          requestId,
          expectedRevision: 1,
        }),
        gateway.rejectAccessRequest({
          actorId: bobId,
          requestId,
          expectedRevision: 1,
          rejectionReason: '并发的第二个决定',
        }),
      ])

      expect(decisions.filter((decision) => decision.status === 'fulfilled')).toHaveLength(1)
      const rejectedDecision = decisions.find(
        (decision) => decision.status === 'rejected',
      )
      expect(rejectedDecision).toBeDefined()
      if (rejectedDecision?.status === 'rejected') {
        expectErrorCode(rejectedDecision.reason, 'CONFLICT')
      }

      const details = await gateway.getAccessRequest({
        viewerId: aliceId,
        requestId,
      })
      expect(details.request.status).not.toBe('Pending')
      expect(details.request.revision).toBe(2)
    })

    it('在写入时重新校验 actor 且失败不改变申请', async () => {
      const gateway = await createGateway()
      const requestId = accessRequestIdSchema.parse('request-pending-high')

      await gateway
        .approveAccessRequest({
          actorId: carolId,
          requestId,
          expectedRevision: 1,
        })
        .then(
          () => expect.fail('无关员工不应审批成功'),
          (error: unknown) => {
            expectErrorCode(error, 'FORBIDDEN')
          },
        )

      const details = await gateway.getAccessRequest({
        viewerId: aliceId,
        requestId,
      })
      expect(details.request).toMatchObject({
        status: 'Pending',
        revision: 1,
      })
    })

    it('拒绝原因在边界 trim 且空白原因不写入', async () => {
      const gateway = await createGateway()
      const requestId = accessRequestIdSchema.parse('request-pending-medium')

      await gateway
        .rejectAccessRequest({
          actorId: carolId,
          requestId,
          expectedRevision: 1,
          rejectionReason: '   ',
        })
        .then(
          () => expect.fail('空白拒绝原因不应成功'),
          (error: unknown) => {
            expectErrorCode(error, 'VALIDATION_ERROR')
          },
        )

      const rejected = await gateway.rejectAccessRequest({
        actorId: carolId,
        requestId,
        expectedRevision: 1,
        rejectionReason: '  缺少业务负责人确认  ',
      })
      expect(rejected).toMatchObject({
        status: 'Rejected',
        revision: 2,
        approvalRecord: {
          rejectionReason: '缺少业务负责人确认',
        },
      })
    })

    it('到期申请不能批准但仍可拒绝', async () => {
      const gateway = await createGateway()
      const requestId = accessRequestIdSchema.parse('request-expired-low')

      await gateway
        .approveAccessRequest({
          actorId: aliceId,
          requestId,
          expectedRevision: 1,
        })
        .then(
          () => expect.fail('到期申请不应批准成功'),
          (error: unknown) => {
            expectErrorCode(error, 'EXPIRED_REQUEST')
          },
        )

      await expect(
        gateway.rejectAccessRequest({
          actorId: aliceId,
          requestId,
          expectedRevision: 1,
          rejectionReason: '申请期限已经过期',
        }),
      ).resolves.toMatchObject({ status: 'Rejected', revision: 2 })
    })

    it('重置会用可信 seed 完整替换已变更状态', async () => {
      const gateway = await createGateway()
      const created = await gateway.createAccessRequest({
        actorId: aliceId,
        resourceId: analyticsId,
        permissionId: managePermissionId,
        accessUntil: dateOnlySchema.parse('2026-10-01'),
        reason: '重置后应消失',
      })

      await gateway.resetDemoData()

      await gateway
        .getAccessRequest({ viewerId: aliceId, requestId: created.id })
        .then(
          () => expect.fail('重置后不应保留新增申请'),
          (error: unknown) => {
            expectErrorCode(error, 'NOT_FOUND')
          },
        )
      const resetList = await gateway.listAccessRequests({
        viewerId: aliceId,
        query: defaultQuery,
      })
      expect(resetList.totalItems).toBe(4)
    })
  })
}
