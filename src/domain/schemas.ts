import { z } from 'zod'

import { AccessFlowError } from './errors'
import {
  REQUEST_STATUSES,
  RISK_LEVELS,
  type AccessRequest,
  type PersistedDemoState,
} from './models'

const requiredTextSchema = z
  .string()
  .trim()
  .min(1, { error: '内容不能为空' })

export const demoUserIdSchema = requiredTextSchema.brand<'DemoUserId'>()
export const resourceIdSchema = requiredTextSchema.brand<'ResourceId'>()
export const permissionIdSchema = requiredTextSchema.brand<'PermissionId'>()
export const accessRequestIdSchema =
  requiredTextSchema.brand<'AccessRequestId'>()
export const dateOnlySchema = z.iso.date().brand<'DateOnly'>()
export const isoDateTimeSchema = z.iso.datetime().brand<'IsoDateTime'>()
export const requestStatusSchema = z.enum(REQUEST_STATUSES)
export const riskLevelSchema = z.enum(RISK_LEVELS)

export const demoUserSchema = z
  .strictObject({
    id: demoUserIdSchema,
    displayName: requiredTextSchema,
  })
  .readonly()

export const permissionSchema = z
  .strictObject({
    id: permissionIdSchema,
    displayName: requiredTextSchema,
  })
  .readonly()

export const resourcePermissionRuleSchema = z
  .strictObject({
    permissionId: permissionIdSchema,
    riskLevel: riskLevelSchema,
  })
  .readonly()

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length
}

export const resourceSchema = z
  .strictObject({
    id: resourceIdSchema,
    displayName: requiredTextSchema,
    permissionRules: z
      .array(resourcePermissionRuleSchema)
      .min(1, { error: '资源至少需要一个权限风险规则' })
      .readonly(),
    approverCandidateIds: z
      .array(demoUserIdSchema)
      .min(1, { error: '资源至少需要一个审批候选员工' })
      .readonly(),
  })
  .superRefine((resource, context) => {
    if (
      hasDuplicates(resource.permissionRules.map((rule) => rule.permissionId))
    ) {
      context.addIssue({
        code: 'custom',
        message: '同一资源的权限风险规则不得重复',
        path: ['permissionRules'],
      })
    }

    if (hasDuplicates(resource.approverCandidateIds)) {
      context.addIssue({
        code: 'custom',
        message: '同一资源的审批候选员工不得重复',
        path: ['approverCandidateIds'],
      })
    }
  })
  .readonly()

export const approvedRecordSchema = z
  .strictObject({
    outcome: z.literal('Approved'),
    approverId: demoUserIdSchema,
    decidedAt: isoDateTimeSchema,
  })
  .readonly()

export const rejectedRecordSchema = z
  .strictObject({
    outcome: z.literal('Rejected'),
    approverId: demoUserIdSchema,
    decidedAt: isoDateTimeSchema,
    rejectionReason: requiredTextSchema,
  })
  .readonly()

const accessRequestBaseShape = {
  id: accessRequestIdSchema,
  requesterId: demoUserIdSchema,
  approverId: demoUserIdSchema,
  resourceId: resourceIdSchema,
  permissionId: permissionIdSchema,
  accessUntil: dateOnlySchema,
  reason: requiredTextSchema,
  riskLevel: riskLevelSchema,
  createdAt: isoDateTimeSchema,
  revision: z.number().int().positive(),
}

const pendingAccessRequestSchema = z
  .strictObject({
    ...accessRequestBaseShape,
    status: z.literal('Pending'),
    approvalRecord: z.null(),
  })
  .readonly()

const approvedAccessRequestSchema = z
  .strictObject({
    ...accessRequestBaseShape,
    status: z.literal('Approved'),
    approvalRecord: approvedRecordSchema,
  })
  .readonly()

const rejectedAccessRequestSchema = z
  .strictObject({
    ...accessRequestBaseShape,
    status: z.literal('Rejected'),
    approvalRecord: rejectedRecordSchema,
  })
  .readonly()

export const accessRequestSchema = z
  .discriminatedUnion('status', [
    pendingAccessRequestSchema,
    approvedAccessRequestSchema,
    rejectedAccessRequestSchema,
  ])
  .superRefine((request, context) => {
    if (request.requesterId === request.approverId) {
      context.addIssue({
        code: 'custom',
        message: '申请人不得同时成为该申请的审批人',
        path: ['approverId'],
      })
    }

    const expectedRevision = request.status === 'Pending' ? 1 : 2
    if (request.revision !== expectedRevision) {
      context.addIssue({
        code: 'custom',
        message: `当前状态的 revision 必须为 ${String(expectedRevision)}`,
        path: ['revision'],
      })
    }

    if (
      request.status !== 'Pending' &&
      request.approvalRecord.approverId !== request.approverId
    ) {
      context.addIssue({
        code: 'custom',
        message: '审批记录必须由申请的负责审批人作出',
        path: ['approvalRecord', 'approverId'],
      })
    }
  }) satisfies z.ZodType<AccessRequest>

export const createAccessRequestCommandSchema = z
  .strictObject({
    actorId: demoUserIdSchema,
    resourceId: resourceIdSchema,
    permissionId: permissionIdSchema,
    accessUntil: dateOnlySchema,
    reason: requiredTextSchema,
  })
  .readonly()

export const approveAccessRequestCommandSchema = z
  .strictObject({
    actorId: demoUserIdSchema,
    requestId: accessRequestIdSchema,
    expectedRevision: z.number().int().positive(),
  })
  .readonly()

export const rejectAccessRequestCommandSchema = z
  .strictObject({
    actorId: demoUserIdSchema,
    requestId: accessRequestIdSchema,
    expectedRevision: z.number().int().positive(),
    rejectionReason: requiredTextSchema,
  })
  .readonly()

export const decisionTimeSchema = z
  .strictObject({
    date: dateOnlySchema,
    timestamp: isoDateTimeSchema,
  })
  .readonly()

const persistedDemoStateShapeSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    users: z.array(demoUserSchema).readonly(),
    permissions: z.array(permissionSchema).readonly(),
    resources: z.array(resourceSchema).readonly(),
    accessRequests: z.array(accessRequestSchema).readonly(),
  })
  .readonly()

export const persistedDemoStateSchema = persistedDemoStateShapeSchema.superRefine(
  (state, context) => {
    const userIds = state.users.map((user) => user.id)
    const permissionIds = state.permissions.map((permission) => permission.id)
    const resourceIds = state.resources.map((resource) => resource.id)
    const requestIds = state.accessRequests.map((request) => request.id)

    const uniqueCollections = [
      { values: userIds, path: ['users'], label: '员工' },
      { values: permissionIds, path: ['permissions'], label: '权限' },
      { values: resourceIds, path: ['resources'], label: '资源' },
      { values: requestIds, path: ['accessRequests'], label: '申请' },
    ] as const

    for (const collection of uniqueCollections) {
      if (hasDuplicates(collection.values)) {
        context.addIssue({
          code: 'custom',
          message: `${collection.label} ID 必须唯一`,
          path: [...collection.path],
        })
      }
    }

    const knownUserIds = new Set(userIds)
    const knownPermissionIds = new Set(permissionIds)
    const resourcesById = new Map(
      state.resources.map((resource) => [resource.id, resource]),
    )

    state.resources.forEach((resource, resourceIndex) => {
      // Seed 必须对任一演示员工都能避开自审批，因此持久化目录至少保留两个候选人。
      if (resource.approverCandidateIds.length < 2) {
        context.addIssue({
          code: 'custom',
          message: '持久化资源至少需要两名不同的审批候选员工',
          path: ['resources', resourceIndex, 'approverCandidateIds'],
        })
      }

      resource.approverCandidateIds.forEach((candidateId, candidateIndex) => {
        if (!knownUserIds.has(candidateId)) {
          context.addIssue({
            code: 'custom',
            message: '审批候选员工必须引用已存在的 DemoUser',
            path: [
              'resources',
              resourceIndex,
              'approverCandidateIds',
              candidateIndex,
            ],
          })
        }
      })

      resource.permissionRules.forEach((rule, ruleIndex) => {
        if (!knownPermissionIds.has(rule.permissionId)) {
          context.addIssue({
            code: 'custom',
            message: '资源权限规则必须引用已存在的 Permission',
            path: [
              'resources',
              resourceIndex,
              'permissionRules',
              ruleIndex,
              'permissionId',
            ],
          })
        }
      })
    })

    state.accessRequests.forEach((request, requestIndex) => {
      if (!knownUserIds.has(request.requesterId)) {
        context.addIssue({
          code: 'custom',
          message: '申请人必须引用已存在的 DemoUser',
          path: ['accessRequests', requestIndex, 'requesterId'],
        })
      }

      if (!knownUserIds.has(request.approverId)) {
        context.addIssue({
          code: 'custom',
          message: '审批人必须引用已存在的 DemoUser',
          path: ['accessRequests', requestIndex, 'approverId'],
        })
      }

      const resource = resourcesById.get(request.resourceId)
      if (!resource) {
        context.addIssue({
          code: 'custom',
          message: '申请必须引用已存在的 Resource',
          path: ['accessRequests', requestIndex, 'resourceId'],
        })
        return
      }

      const permissionIsAllowed = resource.permissionRules.some(
        (rule) => rule.permissionId === request.permissionId,
      )
      if (!permissionIsAllowed) {
        context.addIssue({
          code: 'custom',
          message: '申请权限必须属于对应资源的允许范围',
          path: ['accessRequests', requestIndex, 'permissionId'],
        })
      }
    })
  },
) satisfies z.ZodType<PersistedDemoState>

export function parsePersistedDemoState(input: unknown): PersistedDemoState {
  const result = persistedDemoStateSchema.safeParse(input)

  if (!result.success) {
    throw new AccessFlowError(
      'CORRUPT_DEMO_DATA',
      'Demo 数据格式或引用关系无效',
    )
  }

  return result.data
}
