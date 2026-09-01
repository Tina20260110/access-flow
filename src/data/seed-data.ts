import { z } from 'zod'

import type { DateOnly, PersistedDemoState } from '../domain/models'
import {
  dateOnlySchema,
  demoUserIdSchema,
  isoDateTimeSchema,
  persistedDemoStateSchema,
} from '../domain/schemas'
import { parseSeedState } from './access-flow-gateway'

export const DEFAULT_DEMO_USER_ID = demoUserIdSchema.parse('user-alice')

function addDays(today: DateOnly, days: number): DateOnly {
  const date = new Date(`${today}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return dateOnlySchema.parse(date.toISOString().slice(0, 10))
}

function timestamp(date: DateOnly, time: string) {
  return isoDateTimeSchema.parse(`${date}T${time}Z`)
}

export function createSeedState(today: DateOnly): PersistedDemoState {
  const pendingCreatedDate = addDays(today, -2)
  const terminalCreatedDate = addDays(today, -10)
  const terminalDecisionDate = addDays(today, -5)
  const expiredCreatedDate = addDays(today, -7)

  const rawState = {
    schemaVersion: 1,
    users: [
      { id: 'user-alice', displayName: 'Alice Chen' },
      { id: 'user-bob', displayName: 'Bob Li' },
      { id: 'user-carol', displayName: 'Carol Wang' },
      { id: 'user-dana', displayName: 'Dana Zhao' },
    ],
    permissions: [
      { id: 'permission-read', displayName: '只读访问' },
      { id: 'permission-contribute', displayName: '编辑访问' },
      { id: 'permission-manage', displayName: '管理访问' },
    ],
    resources: [
      {
        id: 'resource-analytics',
        displayName: '数据分析平台',
        permissionRules: [
          { permissionId: 'permission-read', riskLevel: 'Low' },
          { permissionId: 'permission-contribute', riskLevel: 'Medium' },
          { permissionId: 'permission-manage', riskLevel: 'High' },
        ],
        approverCandidateIds: [
          'user-bob',
          'user-carol',
          'user-alice',
          'user-dana',
        ],
      },
      {
        id: 'resource-deployment',
        displayName: '生产部署后台',
        permissionRules: [
          { permissionId: 'permission-read', riskLevel: 'Medium' },
          { permissionId: 'permission-manage', riskLevel: 'High' },
        ],
        approverCandidateIds: [
          'user-carol',
          'user-alice',
          'user-bob',
          'user-dana',
        ],
      },
      {
        id: 'resource-knowledge',
        displayName: '内部知识库',
        permissionRules: [
          { permissionId: 'permission-read', riskLevel: 'Low' },
          { permissionId: 'permission-contribute', riskLevel: 'Medium' },
        ],
        approverCandidateIds: [
          'user-alice',
          'user-bob',
          'user-carol',
          'user-dana',
        ],
      },
    ],
    accessRequests: [
      {
        id: 'request-pending-high',
        requesterId: 'user-alice',
        approverId: 'user-bob',
        resourceId: 'resource-analytics',
        permissionId: 'permission-manage',
        accessUntil: addDays(today, 30),
        reason: '排查季度报表数据问题',
        riskLevel: 'High',
        createdAt: timestamp(pendingCreatedDate, '01:00:00.000'),
        revision: 1,
        status: 'Pending',
        approvalRecord: null,
      },
      {
        id: 'request-pending-medium',
        requesterId: 'user-bob',
        approverId: 'user-carol',
        resourceId: 'resource-analytics',
        permissionId: 'permission-contribute',
        accessUntil: addDays(today, 45),
        reason: '维护团队数据模型',
        riskLevel: 'Medium',
        createdAt: timestamp(pendingCreatedDate, '02:00:00.000'),
        revision: 1,
        status: 'Pending',
        approvalRecord: null,
      },
      {
        id: 'request-approved-low',
        requesterId: 'user-bob',
        approverId: 'user-alice',
        resourceId: 'resource-knowledge',
        permissionId: 'permission-read',
        accessUntil: addDays(today, 60),
        reason: '查阅项目交接文档',
        riskLevel: 'Low',
        createdAt: timestamp(terminalCreatedDate, '01:00:00.000'),
        revision: 2,
        status: 'Approved',
        approvalRecord: {
          outcome: 'Approved',
          approverId: 'user-alice',
          decidedAt: timestamp(terminalDecisionDate, '01:00:00.000'),
        },
      },
      {
        id: 'request-rejected-high',
        requesterId: 'user-carol',
        approverId: 'user-alice',
        resourceId: 'resource-deployment',
        permissionId: 'permission-manage',
        accessUntil: addDays(today, 20),
        reason: '临时处理生产发布',
        riskLevel: 'High',
        createdAt: timestamp(terminalCreatedDate, '02:00:00.000'),
        revision: 2,
        status: 'Rejected',
        approvalRecord: {
          outcome: 'Rejected',
          approverId: 'user-alice',
          decidedAt: timestamp(terminalDecisionDate, '02:00:00.000'),
          rejectionReason: '缺少已批准的变更单',
        },
      },
      {
        id: 'request-expired-low',
        requesterId: 'user-carol',
        approverId: 'user-alice',
        resourceId: 'resource-knowledge',
        permissionId: 'permission-read',
        accessUntil: today,
        reason: '查阅已归档的项目说明',
        riskLevel: 'Low',
        createdAt: timestamp(expiredCreatedDate, '01:00:00.000'),
        revision: 1,
        status: 'Pending',
        approvalRecord: null,
      },
    ],
  } satisfies z.input<typeof persistedDemoStateSchema>

  return parseSeedState(rawState)
}
