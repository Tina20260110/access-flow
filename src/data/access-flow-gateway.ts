import { z } from 'zod'

import { AccessFlowError } from '../domain/errors'
import {
  PAGE_SIZE,
  type AccessRequest,
  type ApproveAccessRequestCommand,
  type ApprovedAccessRequest,
  type CreateAccessRequestCommand,
  type DateOnly,
  type DemoUser,
  type DemoUserId,
  type ListQueryState,
  type Page,
  type PendingAccessRequest,
  type PersistedDemoState,
  type RejectAccessRequestCommand,
  type RejectedAccessRequest,
  type ResourceCatalog,
} from '../domain/models'
import { assignApproverId, resolveRiskLevel } from '../domain/request-rules'
import {
  approveAccessRequest as transitionToApproved,
  rejectAccessRequest as transitionToRejected,
} from '../domain/request-transitions'
import {
  accessRequestIdSchema,
  accessRequestSchema,
  approveAccessRequestCommandSchema,
  createAccessRequestCommandSchema,
  dateOnlySchema,
  demoUserIdSchema,
  demoUserSchema,
  isoDateTimeSchema,
  parsePersistedDemoState,
  permissionSchema,
  persistedDemoStateSchema,
  rejectAccessRequestCommandSchema,
  requestStatusSchema,
  resourceSchema,
  riskLevelSchema,
} from '../domain/schemas'

const listQueryStateSchema = z
  .strictObject({
    search: z.string().trim(),
    status: requestStatusSchema.nullable(),
    riskLevel: riskLevelSchema.nullable(),
    page: z.number().int().positive().refine(Number.isSafeInteger),
  })
  .readonly()

const listAccessRequestsInputSchema = z
  .strictObject({
    viewerId: demoUserIdSchema,
    query: listQueryStateSchema,
  })
  .readonly()

const getAccessRequestInputSchema = z
  .strictObject({
    viewerId: demoUserIdSchema,
    requestId: accessRequestIdSchema,
  })
  .readonly()

export const accessRequestSummarySchema = z
  .strictObject({
    id: accessRequestIdSchema,
    requester: demoUserSchema,
    resource: resourceSchema,
    permission: permissionSchema,
    status: requestStatusSchema,
    riskLevel: riskLevelSchema,
    createdAt: isoDateTimeSchema,
  })
  .readonly()

export type AccessRequestSummary = z.infer<typeof accessRequestSummarySchema>

export const accessRequestDetailsSchema = z
  .strictObject({
    request: accessRequestSchema,
    requester: demoUserSchema,
    approver: demoUserSchema,
    resource: resourceSchema,
    permission: permissionSchema,
  })
  .readonly()

export type AccessRequestDetails = z.infer<typeof accessRequestDetailsSchema>

export const resourceCatalogSchema = z
  .strictObject({
    permissions: z.array(permissionSchema).readonly(),
    resources: z.array(resourceSchema).readonly(),
  })
  .readonly()

const accessRequestPageSchema = z
  .strictObject({
    items: z.array(accessRequestSummarySchema).readonly(),
    page: z.number().int().positive(),
    pageSize: z.literal(PAGE_SIZE),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .readonly()

export type ListAccessRequestsInput = Readonly<{
  viewerId: DemoUserId
  query: ListQueryState
}>

export type GetAccessRequestInput = Readonly<{
  viewerId: DemoUserId
  requestId: AccessRequest['id']
}>

export interface AccessFlowGateway {
  getDemoUsers(): Promise<readonly DemoUser[]>
  getResources(): Promise<ResourceCatalog>
  listAccessRequests(
    input: ListAccessRequestsInput,
  ): Promise<Page<AccessRequestSummary>>
  getAccessRequest(input: GetAccessRequestInput): Promise<AccessRequestDetails>
  createAccessRequest(
    command: CreateAccessRequestCommand,
  ): Promise<PendingAccessRequest>
  approveAccessRequest(
    command: ApproveAccessRequestCommand,
  ): Promise<ApprovedAccessRequest>
  rejectAccessRequest(
    command: RejectAccessRequestCommand,
  ): Promise<RejectedAccessRequest>
  resetDemoData(): Promise<void>
}

export type GatewayRuntime = Readonly<{
  now: () => Date
  createRequestId: () => string
}>

export const defaultGatewayRuntime: GatewayRuntime = {
  now: () => new Date(),
  createRequestId: () => crypto.randomUUID(),
}

export type GatewayStateChange<T> = Readonly<{
  state: PersistedDemoState
  result: T
}>

function validationError(message: string, field?: string): AccessFlowError {
  return new AccessFlowError(
    'VALIDATION_ERROR',
    message,
    field ? { field } : {},
  )
}

function parseListInput(input: ListAccessRequestsInput) {
  const result = listAccessRequestsInputSchema.safeParse(input)
  if (!result.success) throw validationError('申请列表查询条件无效')
  return result.data
}

function parseDetailsInput(input: GetAccessRequestInput) {
  const result = getAccessRequestInputSchema.safeParse(input)
  if (!result.success) throw validationError('申请详情查询条件无效')
  return result.data
}

function getLocalDateOnly(date: Date): DateOnly {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return dateOnlySchema.parse(`${year}-${month}-${day}`)
}

function findUser(state: PersistedDemoState, id: DemoUserId): DemoUser {
  const user = state.users.find((candidate) => candidate.id === id)
  if (!user) {
    throw new AccessFlowError('CORRUPT_DEMO_DATA', '申请引用了不存在的员工')
  }
  return user
}

function buildSummary(
  state: PersistedDemoState,
  request: AccessRequest,
): AccessRequestSummary {
  const resource = state.resources.find(
    (candidate) => candidate.id === request.resourceId,
  )
  const permission = state.permissions.find(
    (candidate) => candidate.id === request.permissionId,
  )

  if (!resource || !permission) {
    throw new AccessFlowError(
      'CORRUPT_DEMO_DATA',
      '申请引用了不存在的资源或权限',
    )
  }

  return accessRequestSummarySchema.parse({
    id: request.id,
    requester: findUser(state, request.requesterId),
    resource,
    permission,
    status: request.status,
    riskLevel: request.riskLevel,
    createdAt: request.createdAt,
  })
}

function buildDetails(
  state: PersistedDemoState,
  request: AccessRequest,
): AccessRequestDetails {
  const resource = state.resources.find(
    (candidate) => candidate.id === request.resourceId,
  )
  const permission = state.permissions.find(
    (candidate) => candidate.id === request.permissionId,
  )

  if (!resource || !permission) {
    throw new AccessFlowError(
      'CORRUPT_DEMO_DATA',
      '申请引用了不存在的资源或权限',
    )
  }

  return accessRequestDetailsSchema.parse({
    request,
    requester: findUser(state, request.requesterId),
    approver: findUser(state, request.approverId),
    resource,
    permission,
  })
}

function ensureViewerExists(
  state: PersistedDemoState,
  viewerId: DemoUserId,
): void {
  if (!state.users.some((user) => user.id === viewerId)) {
    throw new AccessFlowError('NOT_FOUND', '当前员工不存在')
  }
}

export function readDemoUsers(stateInput: unknown): readonly DemoUser[] {
  const state = parsePersistedDemoState(stateInput)
  return z.array(demoUserSchema).readonly().parse(state.users)
}

export function readResourceCatalog(stateInput: unknown): ResourceCatalog {
  const state = parsePersistedDemoState(stateInput)
  return resourceCatalogSchema.parse({
    permissions: state.permissions,
    resources: state.resources,
  })
}

export function readAccessRequestList(
  stateInput: unknown,
  input: ListAccessRequestsInput,
): Page<AccessRequestSummary> {
  const state = parsePersistedDemoState(stateInput)
  const { viewerId, query } = parseListInput(input)
  ensureViewerExists(state, viewerId)

  const usersById = new Map(state.users.map((user) => [user.id, user]))
  const resourcesById = new Map(
    state.resources.map((resource) => [resource.id, resource]),
  )
  const normalizedSearch = query.search.toLowerCase()

  const matchingRequests = state.accessRequests
    .filter(
      (request) =>
        request.requesterId === viewerId || request.approverId === viewerId,
    )
    .filter((request) => {
      if (!normalizedSearch) return true
      const requesterName = usersById
        .get(request.requesterId)
        ?.displayName.toLowerCase()
      const resourceName = resourcesById
        .get(request.resourceId)
        ?.displayName.toLowerCase()
      return (
        requesterName?.includes(normalizedSearch) === true ||
        resourceName?.includes(normalizedSearch) === true
      )
    })
    .filter((request) => !query.status || request.status === query.status)
    .filter(
      (request) => !query.riskLevel || request.riskLevel === query.riskLevel,
    )
    .sort((left, right) => {
      const timeOrder = right.createdAt.localeCompare(left.createdAt)
      return timeOrder || left.id.localeCompare(right.id)
    })

  const totalItems = matchingRequests.length
  const totalPages = Math.ceil(totalItems / PAGE_SIZE)
  const page = totalPages === 0 ? 1 : Math.min(query.page, totalPages)
  const start = (page - 1) * PAGE_SIZE
  const items = matchingRequests
    .slice(start, start + PAGE_SIZE)
    .map((request) => buildSummary(state, request))

  return accessRequestPageSchema.parse({
    items,
    page,
    pageSize: PAGE_SIZE,
    totalItems,
    totalPages,
  })
}

export function readAccessRequestDetails(
  stateInput: unknown,
  input: GetAccessRequestInput,
): AccessRequestDetails {
  const state = parsePersistedDemoState(stateInput)
  const { viewerId, requestId } = parseDetailsInput(input)
  ensureViewerExists(state, viewerId)

  const request = state.accessRequests.find(
    (candidate) => candidate.id === requestId,
  )
  const isVisible =
    request?.requesterId === viewerId || request?.approverId === viewerId

  if (!request || !isVisible) {
    throw new AccessFlowError('NOT_FOUND', '申请不存在或当前员工不可查看')
  }

  return buildDetails(state, request)
}

export function applyCreateAccessRequest(
  stateInput: unknown,
  commandInput: CreateAccessRequestCommand,
  runtime: GatewayRuntime,
): GatewayStateChange<PendingAccessRequest> {
  const state = parsePersistedDemoState(stateInput)
  const commandResult = createAccessRequestCommandSchema.safeParse(commandInput)
  if (!commandResult.success) throw validationError('创建申请命令无效')
  const command = commandResult.data

  if (!state.users.some((user) => user.id === command.actorId)) {
    throw new AccessFlowError('NOT_FOUND', '申请员工不存在')
  }

  const resource = state.resources.find(
    (candidate) => candidate.id === command.resourceId,
  )
  if (!resource) throw new AccessFlowError('NOT_FOUND', '目标资源不存在')

  const now = runtime.now()
  const today = getLocalDateOnly(now)
  if (command.accessUntil <= today) {
    throw validationError('访问截止日期必须晚于提交日', 'accessUntil')
  }

  const riskLevel = resolveRiskLevel(resource, command.permissionId)
  const approverId = assignApproverId(resource, command.actorId)
  const requestIdResult = accessRequestIdSchema.safeParse(
    runtime.createRequestId(),
  )
  if (!requestIdResult.success) {
    throw new AccessFlowError('CORRUPT_DEMO_DATA', '申请 ID 生成器返回了无效值')
  }
  const requestId = requestIdResult.data

  if (state.accessRequests.some((request) => request.id === requestId)) {
    throw new AccessFlowError('CONFLICT', '新申请 ID 与已有申请冲突', {
      requestId,
    })
  }

  const request = accessRequestSchema.parse({
    id: requestId,
    requesterId: command.actorId,
    approverId,
    resourceId: resource.id,
    permissionId: command.permissionId,
    accessUntil: command.accessUntil,
    reason: command.reason,
    riskLevel,
    createdAt: isoDateTimeSchema.parse(now.toISOString()),
    revision: 1,
    status: 'Pending',
    approvalRecord: null,
  })
  if (request.status !== 'Pending') {
    throw new AccessFlowError('CORRUPT_DEMO_DATA', '新申请没有形成 Pending 状态')
  }

  const nextState = parsePersistedDemoState({
    ...state,
    accessRequests: [...state.accessRequests, request],
  })

  const trustedRequest = accessRequestSchema.parse(request)
  if (trustedRequest.status !== 'Pending') {
    throw new AccessFlowError('CORRUPT_DEMO_DATA', '新申请返回状态无效')
  }

  return {
    state: nextState,
    result: trustedRequest,
  }
}

function ensureActorExists(
  state: PersistedDemoState,
  actorId: DemoUserId,
): void {
  if (!state.users.some((user) => user.id === actorId)) {
    throw new AccessFlowError('FORBIDDEN', '当前审批员工不存在')
  }
}

function replaceRequest(
  state: PersistedDemoState,
  request: AccessRequest,
): PersistedDemoState {
  return parsePersistedDemoState({
    ...state,
    accessRequests: state.accessRequests.map((candidate) =>
      candidate.id === request.id ? request : candidate,
    ),
  })
}

export function applyApproveAccessRequest(
  stateInput: unknown,
  commandInput: ApproveAccessRequestCommand,
  runtime: GatewayRuntime,
): GatewayStateChange<ApprovedAccessRequest> {
  const state = parsePersistedDemoState(stateInput)
  const commandResult = approveAccessRequestCommandSchema.safeParse(commandInput)
  if (!commandResult.success) throw validationError('批准申请命令无效')
  const command = commandResult.data
  ensureActorExists(state, command.actorId)

  const request = state.accessRequests.find(
    (candidate) => candidate.id === command.requestId,
  )
  if (!request) throw new AccessFlowError('NOT_FOUND', '申请不存在')

  const now = runtime.now()
  const approved = transitionToApproved(request, command, {
    date: getLocalDateOnly(now),
    timestamp: isoDateTimeSchema.parse(now.toISOString()),
  })
  const nextState = replaceRequest(state, approved)

  const trustedApproved = accessRequestSchema.parse(approved)
  if (trustedApproved.status !== 'Approved') {
    throw new AccessFlowError('CORRUPT_DEMO_DATA', '批准申请返回状态无效')
  }

  return {
    state: nextState,
    result: trustedApproved,
  }
}

export function applyRejectAccessRequest(
  stateInput: unknown,
  commandInput: RejectAccessRequestCommand,
  runtime: GatewayRuntime,
): GatewayStateChange<RejectedAccessRequest> {
  const state = parsePersistedDemoState(stateInput)
  const commandResult = rejectAccessRequestCommandSchema.safeParse(commandInput)
  if (!commandResult.success) throw validationError('拒绝申请命令无效')
  const command = commandResult.data
  ensureActorExists(state, command.actorId)

  const request = state.accessRequests.find(
    (candidate) => candidate.id === command.requestId,
  )
  if (!request) throw new AccessFlowError('NOT_FOUND', '申请不存在')

  const now = runtime.now()
  const rejected = transitionToRejected(request, command, {
    date: getLocalDateOnly(now),
    timestamp: isoDateTimeSchema.parse(now.toISOString()),
  })
  const nextState = replaceRequest(state, rejected)

  const trustedRejected = accessRequestSchema.parse(rejected)
  if (trustedRejected.status !== 'Rejected') {
    throw new AccessFlowError('CORRUPT_DEMO_DATA', '拒绝申请返回状态无效')
  }

  return {
    state: nextState,
    result: trustedRejected,
  }
}

export function parseSeedState(input: unknown): PersistedDemoState {
  const result = persistedDemoStateSchema.safeParse(input)
  if (!result.success) {
    throw new AccessFlowError('CORRUPT_SEED_DATA', '内置 Demo seed 无效')
  }
  return result.data
}
