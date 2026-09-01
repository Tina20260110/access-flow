import type { $brand } from 'zod'

export const REQUEST_STATUSES = ['Pending', 'Approved', 'Rejected'] as const
export const RISK_LEVELS = ['Low', 'Medium', 'High'] as const
export const PAGE_SIZE = 10 as const

export type DemoUserId = string & $brand<'DemoUserId'>
export type ResourceId = string & $brand<'ResourceId'>
export type PermissionId = string & $brand<'PermissionId'>
export type AccessRequestId = string & $brand<'AccessRequestId'>
export type DateOnly = string & $brand<'DateOnly'>
export type IsoDateTime = string & $brand<'IsoDateTime'>

export type RequestStatus = (typeof REQUEST_STATUSES)[number]
export type RiskLevel = (typeof RISK_LEVELS)[number]

export type DemoUser = Readonly<{
  id: DemoUserId
  displayName: string
}>

export type Permission = Readonly<{
  id: PermissionId
  displayName: string
}>

export type ResourcePermissionRule = Readonly<{
  permissionId: PermissionId
  riskLevel: RiskLevel
}>

export type Resource = Readonly<{
  id: ResourceId
  displayName: string
  permissionRules: readonly ResourcePermissionRule[]
  approverCandidateIds: readonly DemoUserId[]
}>

export type ResourceCatalog = Readonly<{
  permissions: readonly Permission[]
  resources: readonly Resource[]
}>

export type ApprovedRecord = Readonly<{
  outcome: 'Approved'
  approverId: DemoUserId
  decidedAt: IsoDateTime
}>

export type RejectedRecord = Readonly<{
  outcome: 'Rejected'
  approverId: DemoUserId
  decidedAt: IsoDateTime
  rejectionReason: string
}>

export type ApprovalRecord = ApprovedRecord | RejectedRecord

export type AccessRequestBase = Readonly<{
  id: AccessRequestId
  requesterId: DemoUserId
  approverId: DemoUserId
  resourceId: ResourceId
  permissionId: PermissionId
  accessUntil: DateOnly
  reason: string
  riskLevel: RiskLevel
  createdAt: IsoDateTime
  revision: number
}>

export type PendingAccessRequest = AccessRequestBase &
  Readonly<{
    status: 'Pending'
    approvalRecord: null
  }>

export type ApprovedAccessRequest = AccessRequestBase &
  Readonly<{
    status: 'Approved'
    approvalRecord: ApprovedRecord
  }>

export type RejectedAccessRequest = AccessRequestBase &
  Readonly<{
    status: 'Rejected'
    approvalRecord: RejectedRecord
  }>

export type AccessRequest =
  | PendingAccessRequest
  | ApprovedAccessRequest
  | RejectedAccessRequest

export type ListQueryState = Readonly<{
  search: string
  status: RequestStatus | null
  riskLevel: RiskLevel | null
  page: number
}>

export type Page<T> = Readonly<{
  items: readonly T[]
  page: number
  pageSize: typeof PAGE_SIZE
  totalItems: number
  totalPages: number
}>

export type PersistedDemoState = Readonly<{
  schemaVersion: 1
  users: readonly DemoUser[]
  permissions: readonly Permission[]
  resources: readonly Resource[]
  accessRequests: readonly AccessRequest[]
}>

export type CreateAccessRequestCommand = Readonly<{
  actorId: DemoUserId
  resourceId: ResourceId
  permissionId: PermissionId
  accessUntil: DateOnly
  reason: string
}>

export type ApproveAccessRequestCommand = Readonly<{
  actorId: DemoUserId
  requestId: AccessRequestId
  expectedRevision: number
}>

export type RejectAccessRequestCommand = Readonly<{
  actorId: DemoUserId
  requestId: AccessRequestId
  expectedRevision: number
  rejectionReason: string
}>

export type DecisionTime = Readonly<{
  date: DateOnly
  timestamp: IsoDateTime
}>
