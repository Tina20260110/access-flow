import 'fake-indexeddb/auto'

import { deleteDB, openDB } from 'idb'
import { describe, expect, it } from 'vitest'

import {
  accessRequestIdSchema,
  dateOnlySchema,
  demoUserIdSchema,
  permissionIdSchema,
  resourceIdSchema,
} from '../domain/schemas'
import {
  gatewayContractRuntime,
  runAccessFlowGatewayContract,
} from '../test/gateway-contract'
import { IndexedDbAccessFlowGateway } from './indexed-db-gateway'

let databaseSequence = 0

runAccessFlowGatewayContract('IndexedDB', (initialState) => {
  databaseSequence += 1
  const databaseName = `access-flow-contract-${String(databaseSequence)}`
  const gateway = new IndexedDbAccessFlowGateway({
    databaseName,
    ...(initialState ? { initialState } : {}),
    runtime: gatewayContractRuntime,
  })

  return {
    gateway,
    cleanup: async () => {
      await gateway.close()
      await deleteDB(databaseName)
    },
  }
})

describe('IndexedDbAccessFlowGateway 持久化边界', () => {
  it('新的 Gateway 实例从 IndexedDB 恢复已创建申请', async () => {
    const databaseName = 'access-flow-persistence-reopen'
    const firstGateway = new IndexedDbAccessFlowGateway({
      databaseName,
      runtime: gatewayContractRuntime,
    })

    try {
      const created = await firstGateway.createAccessRequest({
        actorId: demoUserIdSchema.parse('user-alice'),
        resourceId: resourceIdSchema.parse('resource-analytics'),
        permissionId: permissionIdSchema.parse('permission-read'),
        accessUntil: dateOnlySchema.parse('2026-10-01'),
        reason: '验证重新打开后的持久化事实',
      })
      await firstGateway.close()

      const reopenedGateway = new IndexedDbAccessFlowGateway({
        databaseName,
        runtime: gatewayContractRuntime,
      })
      try {
        await expect(
          reopenedGateway.getAccessRequest({
            viewerId: demoUserIdSchema.parse('user-alice'),
            requestId: created.id,
          }),
        ).resolves.toMatchObject({ request: created })
      } finally {
        await reopenedGateway.close()
      }
    } finally {
      await firstGateway.close()
      await deleteDB(databaseName)
    }
  })

  it('两个 Gateway 实例并发审批时只有首个决定生效', async () => {
    const databaseName = 'access-flow-persistence-conflict'
    const firstGateway = new IndexedDbAccessFlowGateway({
      databaseName,
      runtime: gatewayContractRuntime,
    })
    const secondGateway = new IndexedDbAccessFlowGateway({
      databaseName,
      runtime: gatewayContractRuntime,
    })
    const requestId = accessRequestIdSchema.parse('request-pending-high')
    const actorId = demoUserIdSchema.parse('user-bob')

    try {
      await Promise.all([
        firstGateway.getDemoUsers(),
        secondGateway.getDemoUsers(),
      ])
      const results = await Promise.allSettled([
        firstGateway.approveAccessRequest({
          actorId,
          requestId,
          expectedRevision: 1,
        }),
        secondGateway.rejectAccessRequest({
          actorId,
          requestId,
          expectedRevision: 1,
          rejectionReason: '并发的后提交决定',
        }),
      ])

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1)
      expect(
        results.find((result) => result.status === 'rejected'),
      ).toMatchObject({ reason: { code: 'CONFLICT' } })

      const details = await firstGateway.getAccessRequest({
        viewerId: demoUserIdSchema.parse('user-alice'),
        requestId,
      })
      expect(details.request.status).not.toBe('Pending')
      expect(details.request.revision).toBe(2)
    } finally {
      await Promise.all([firstGateway.close(), secondGateway.close()])
      await deleteDB(databaseName)
    }
  })

  it('读取损坏根文档时明确失败且不静默覆盖', async () => {
    const databaseName = 'access-flow-persistence-corrupt'
    const database = await openCorruptDatabase(databaseName)
    database.close()
    const gateway = new IndexedDbAccessFlowGateway({
      databaseName,
      runtime: gatewayContractRuntime,
    })

    try {
      await expect(gateway.getDemoUsers()).rejects.toMatchObject({
        code: 'CORRUPT_DEMO_DATA',
      })
    } finally {
      await gateway.close().catch(() => undefined)
      await deleteDB(databaseName)
    }
  })

  it('只有显式重置才用有效 seed 替换损坏根文档', async () => {
    const databaseName = 'access-flow-persistence-corrupt-recovery'
    const database = await openCorruptDatabase(databaseName)
    database.close()
    const gateway = new IndexedDbAccessFlowGateway({
      databaseName,
      runtime: gatewayContractRuntime,
    })

    try {
      await expect(gateway.getDemoUsers()).rejects.toMatchObject({
        code: 'CORRUPT_DEMO_DATA',
      })
      await expect(gateway.getDemoUsers()).rejects.toMatchObject({
        code: 'CORRUPT_DEMO_DATA',
      })

      await gateway.resetDemoData()

      await expect(gateway.getDemoUsers()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'user-alice' }),
        ]),
      )
    } finally {
      await gateway.close().catch(() => undefined)
      await deleteDB(databaseName)
    }
  })
})

async function openCorruptDatabase(databaseName: string) {
  const database = await openDB(databaseName, 1, {
    upgrade(newDatabase) {
      newDatabase.createObjectStore('demo-state')
    },
  })
  await database.put('demo-state', { schemaVersion: 999 }, 'root')
  return database
}
