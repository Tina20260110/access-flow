import type { ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'

import { isAccessFlowError } from '../domain/errors'
import type { DateOnly } from '../domain/models'
import { dateOnlySchema } from '../domain/schemas'
import { useDemoIdentity } from '../features/demo-identity/demo-identity-context'
import { CreateRequestForm } from '../features/request-create/CreateRequestForm'
import {
  useCreateAccessRequestMutation,
  useCreateResourceCatalogQuery,
} from '../features/request-create/create-request.queries'
import type { CreateRequestFormValues } from '../features/request-create/create-request.schema'

function getLocalToday(date: Date): DateOnly {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return dateOnlySchema.parse(`${year}-${month}-${day}`)
}

function getCreateErrorMessage(error: unknown): string {
  if (!isAccessFlowError(error)) {
    return '申请提交失败，请稍后重试。'
  }

  switch (error.code) {
    case 'TRANSIENT_FAILURE':
      return '提交暂时失败，请重试。'
    case 'UNMAPPED_PERMISSION':
      return '所选资源与权限组合已不可用，请重新选择。'
    case 'NO_ELIGIBLE_APPROVER':
      return '当前资源无法分配负责审批员工，请选择其他资源。'
    case 'NOT_FOUND':
      return '当前员工或所选资源已不可用，请刷新后重试。'
    case 'VALIDATION_ERROR':
      return '申请内容未通过业务校验，请检查后重试。'
    default:
      return '申请提交失败，请稍后重试。'
  }
}

export function CreateRequestPage(): ReactElement {
  const navigate = useNavigate()
  const { currentDemoUserId } = useDemoIdentity()
  const catalogQuery = useCreateResourceCatalogQuery()
  const createMutation = useCreateAccessRequestMutation(currentDemoUserId)
  const today = getLocalToday(new Date())

  const submitRequest = async (
    values: CreateRequestFormValues,
  ): Promise<void> => {
    const request = await createMutation.mutateAsync(values)
    await navigate(`/requests/${encodeURIComponent(request.id)}`, {
      state: { creationSucceeded: true },
    })
  }

  return (
    <section aria-busy={catalogQuery.isPending}>
      <h1 className="text-3xl font-semibold">创建权限申请</h1>
      <p className="mt-3 text-slate-600">
        填写访问范围、截止日期和业务原因。风险等级与负责审批员工将在提交时由系统规则确定。
      </p>

      {catalogQuery.isPending ? (
        <p className="mt-8" role="status">
          正在加载可申请资源…
        </p>
      ) : null}

      {catalogQuery.isError ? (
        <div className="mt-8" role="alert">
          <p>无法加载资源目录。</p>
          <button
            className="mt-3 rounded-md border border-slate-400 px-4 py-2"
            onClick={() => void catalogQuery.refetch()}
            type="button"
          >
            重试加载
          </button>
        </div>
      ) : null}

      {catalogQuery.isSuccess && catalogQuery.data.resources.length === 0 ? (
        <p className="mt-8">暂无可申请的目标资源。</p>
      ) : null}

      {catalogQuery.isSuccess && catalogQuery.data.resources.length > 0 ? (
        <CreateRequestForm
          catalog={catalogQuery.data}
          onSubmit={submitRequest}
          submissionError={
            createMutation.isError
              ? getCreateErrorMessage(createMutation.error)
              : null
          }
          today={today}
        />
      ) : null}
    </section>
  )
}
