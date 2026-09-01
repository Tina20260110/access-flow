import { AccessFlowError } from './errors'
import type {
  AccessRequest,
  ApproveAccessRequestCommand,
  ApprovedAccessRequest,
  DateOnly,
  DecisionTime,
  DemoUserId,
  PendingAccessRequest,
  RejectAccessRequestCommand,
  RejectedAccessRequest,
} from './models'

export function canDecideRequest(
  request: AccessRequest,
  actorId: DemoUserId,
): boolean {
  return (
    request.status === 'Pending' &&
    actorId === request.approverId &&
    actorId !== request.requesterId
  )
}

export function canApproveRequest(
  request: AccessRequest,
  actorId: DemoUserId,
  decisionDate: DateOnly,
): boolean {
  return (
    canDecideRequest(request, actorId) && request.accessUntil > decisionDate
  )
}

function assertMatchingRequest(
  request: AccessRequest,
  requestId: ApproveAccessRequestCommand['requestId'],
): void {
  if (request.id !== requestId) {
    throw new AccessFlowError('NOT_FOUND', '找不到要审批的申请', { requestId })
  }
}

function assertCurrentPendingRevision(
  request: AccessRequest,
  expectedRevision: number,
): asserts request is PendingAccessRequest {
  // 终态与旧 revision 都表示客户端视图已过期，统一要求调用方重新读取可信详情。
  if (
    request.status !== 'Pending' ||
    request.revision !== expectedRevision
  ) {
    throw new AccessFlowError('CONFLICT', '申请已被处理或版本已更新', {
      requestId: request.id,
      expectedRevision,
      actualRevision: request.revision,
    })
  }
}

function assertCanDecide(
  request: PendingAccessRequest,
  actorId: DemoUserId,
): void {
  if (!canDecideRequest(request, actorId)) {
    throw new AccessFlowError('FORBIDDEN', '当前员工不能处理这条申请', {
      requestId: request.id,
      actorId,
    })
  }
}

export function approveAccessRequest(
  request: AccessRequest,
  command: ApproveAccessRequestCommand,
  decisionTime: DecisionTime,
): ApprovedAccessRequest {
  assertMatchingRequest(request, command.requestId)
  assertCurrentPendingRevision(request, command.expectedRevision)
  assertCanDecide(request, command.actorId)

  if (!canApproveRequest(request, command.actorId, decisionTime.date)) {
    throw new AccessFlowError(
      'EXPIRED_REQUEST',
      '访问截止日期已到或已过，不能批准申请',
      { requestId: request.id, accessUntil: request.accessUntil },
    )
  }

  return {
    ...request,
    status: 'Approved',
    revision: request.revision + 1,
    approvalRecord: {
      outcome: 'Approved',
      approverId: command.actorId,
      decidedAt: decisionTime.timestamp,
    },
  }
}

export function rejectAccessRequest(
  request: AccessRequest,
  command: RejectAccessRequestCommand,
  decisionTime: DecisionTime,
): RejectedAccessRequest {
  assertMatchingRequest(request, command.requestId)
  assertCurrentPendingRevision(request, command.expectedRevision)
  assertCanDecide(request, command.actorId)

  const rejectionReason = command.rejectionReason.trim()
  if (!rejectionReason) {
    throw new AccessFlowError('VALIDATION_ERROR', '拒绝原因不能为空', {
      requestId: request.id,
      field: 'rejectionReason',
    })
  }

  return {
    ...request,
    status: 'Rejected',
    revision: request.revision + 1,
    approvalRecord: {
      outcome: 'Rejected',
      approverId: command.actorId,
      decidedAt: decisionTime.timestamp,
      rejectionReason,
    },
  }
}
