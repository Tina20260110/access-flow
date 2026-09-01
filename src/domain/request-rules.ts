import { AccessFlowError } from './errors'
import type {
  DemoUserId,
  PermissionId,
  Resource,
  RiskLevel,
} from './models'

export function resolveRiskLevel(
  resource: Resource,
  permissionId: PermissionId,
): RiskLevel {
  const rule = resource.permissionRules.find(
    (candidate) => candidate.permissionId === permissionId,
  )

  if (!rule) {
    // 缺失映射代表目录没有授权该组合，使用默认值会把配置错误伪装成有效申请。
    throw new AccessFlowError(
      'UNMAPPED_PERMISSION',
      '目标资源不支持所选权限',
      { resourceId: resource.id, permissionId },
    )
  }

  return rule.riskLevel
}

export function assignApproverId(
  resource: Resource,
  requesterId: DemoUserId,
): DemoUserId {
  const approverId = resource.approverCandidateIds.find(
    (candidateId) => candidateId !== requesterId,
  )

  if (!approverId) {
    throw new AccessFlowError(
      'NO_ELIGIBLE_APPROVER',
      '目标资源没有可分配的非申请人审批员工',
      { resourceId: resource.id, requesterId },
    )
  }

  return approverId
}
