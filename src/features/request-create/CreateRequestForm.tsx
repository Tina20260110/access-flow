import { zodResolver } from '@hookform/resolvers/zod'
import {
  useEffect,
  useMemo,
  useRef,
  type ReactElement,
} from 'react'
import { useForm, useWatch } from 'react-hook-form'

import type {
  DateOnly,
  ResourceCatalog,
} from '../../domain/models'
import {
  createRequestFormSchema,
  type CreateRequestFormInput,
  type CreateRequestFormValues,
} from './create-request.schema'

type CreateRequestFormProps = Readonly<{
  catalog: ResourceCatalog
  onSubmit: (values: CreateRequestFormValues) => Promise<void>
  submissionError: string | null
  today: DateOnly
}>

const fieldClassName =
  'mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 disabled:bg-slate-100'

export function CreateRequestForm({
  catalog,
  onSubmit,
  submissionError,
  today,
}: CreateRequestFormProps): ReactElement {
  const schema = useMemo(() => createRequestFormSchema(today), [today])
  const submissionErrorRef = useRef<HTMLDivElement>(null)
  const {
    control,
    formState: { errors, isSubmitted, isSubmitting },
    handleSubmit,
    register,
    setValue,
  } = useForm<
    CreateRequestFormInput,
    unknown,
    CreateRequestFormValues
  >({
    defaultValues: {
      expiresAt: '',
      permission: '',
      reason: '',
      resourceId: '',
    },
    resolver: zodResolver(schema),
    shouldFocusError: true,
  })

  useEffect(() => {
    if (submissionError !== null) submissionErrorRef.current?.focus()
  }, [submissionError])

  const selectedResourceId = useWatch({ control, name: 'resourceId' })
  const selectedResource = catalog.resources.find(
    (resource) => resource.id === selectedResourceId,
  )
  const permissionsById = useMemo(
    () => new Map(catalog.permissions.map((permission) => [permission.id, permission])),
    [catalog.permissions],
  )
  const resourceField = register('resourceId', {
    onChange: () => {
      setValue('permission', '', { shouldValidate: isSubmitted })
    },
  })

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values)
    } catch {
      return
    }
  })

  return (
    <form
      aria-busy={isSubmitting}
      className="mt-8 max-w-2xl space-y-6"
      noValidate
      onSubmit={(event) => {
        void submit(event)
      }}
    >
      {submissionError === null ? null : (
        <div
          className="rounded-md border border-red-300 bg-red-50 p-4 text-red-950"
          ref={submissionErrorRef}
          role="alert"
          tabIndex={-1}
        >
          <p className="font-semibold">申请提交失败</p>
          <p>{submissionError}</p>
        </div>
      )}

      <div>
        <label className="font-medium" htmlFor="create-resource">
          目标资源
        </label>
        <select
          {...resourceField}
          aria-describedby={
            errors.resourceId ? 'create-resource-error' : undefined
          }
          aria-invalid={errors.resourceId ? 'true' : undefined}
          className={fieldClassName}
          id="create-resource"
        >
          <option value="">请选择目标资源</option>
          {catalog.resources.map((resource) => (
            <option key={resource.id} value={resource.id}>
              {resource.displayName}
            </option>
          ))}
        </select>
        {errors.resourceId ? (
          <p className="mt-2 text-sm text-red-700" id="create-resource-error">
            {errors.resourceId.message}
          </p>
        ) : null}
      </div>

      <div>
        <label className="font-medium" htmlFor="create-permission">
          请求的权限级别
        </label>
        <select
          {...register('permission')}
          aria-describedby={
            errors.permission ? 'create-permission-error' : undefined
          }
          aria-invalid={errors.permission ? 'true' : undefined}
          className={fieldClassName}
          disabled={selectedResource === undefined}
          id="create-permission"
        >
          <option value="">请选择请求的权限级别</option>
          {selectedResource?.permissionRules.map((rule) => {
            const permission = permissionsById.get(rule.permissionId)
            return permission ? (
              <option key={permission.id} value={permission.id}>
                {permission.displayName}
              </option>
            ) : null
          })}
        </select>
        {errors.permission ? (
          <p
            className="mt-2 text-sm text-red-700"
            id="create-permission-error"
          >
            {errors.permission.message}
          </p>
        ) : null}
      </div>

      <div>
        <label className="font-medium" htmlFor="create-expires-at">
          访问截止日期
        </label>
        <input
          {...register('expiresAt')}
          aria-describedby={
            errors.expiresAt ? 'create-expires-at-error' : undefined
          }
          aria-invalid={errors.expiresAt ? 'true' : undefined}
          className={fieldClassName}
          id="create-expires-at"
          min={today}
          type="date"
        />
        {errors.expiresAt ? (
          <p
            className="mt-2 text-sm text-red-700"
            id="create-expires-at-error"
          >
            {errors.expiresAt.message}
          </p>
        ) : null}
      </div>

      <div>
        <label className="font-medium" htmlFor="create-reason">
          申请原因
        </label>
        <textarea
          {...register('reason')}
          aria-describedby={errors.reason ? 'create-reason-error' : undefined}
          aria-invalid={errors.reason ? 'true' : undefined}
          className={fieldClassName}
          id="create-reason"
          rows={5}
        />
        {errors.reason ? (
          <p className="mt-2 text-sm text-red-700" id="create-reason-error">
            {errors.reason.message}
          </p>
        ) : null}
      </div>

      <button
        className="rounded-md bg-blue-700 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting
          ? '正在提交…'
          : submissionError
            ? '重新提交'
            : '提交权限申请'}
      </button>
    </form>
  )
}
