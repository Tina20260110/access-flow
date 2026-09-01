import { z } from 'zod'

import type { DateOnly } from '../../domain/models'
import {
  dateOnlySchema,
  permissionIdSchema,
  resourceIdSchema,
} from '../../domain/schemas'

export function createRequestFormSchema(today: DateOnly) {
  return z
    .strictObject({
      resourceId: z
        .string()
        .trim()
        .min(1, { error: '请选择目标资源' })
        .pipe(resourceIdSchema),
      permission: z
        .string()
        .trim()
        .min(1, { error: '请选择请求的权限级别' })
        .pipe(permissionIdSchema),
      expiresAt: z
        .string()
        .trim()
        .min(1, { error: '请选择访问截止日期' })
        .pipe(dateOnlySchema)
        .refine((expiresAt) => expiresAt > today, {
          error: '访问截止日期必须晚于提交日',
        }),
      reason: z
        .string()
        .trim()
        .min(1, { error: '请填写申请原因' }),
    })
    .readonly()
}

export type CreateRequestFormInput = z.input<
  ReturnType<typeof createRequestFormSchema>
>

export type CreateRequestFormValues = z.output<
  ReturnType<typeof createRequestFormSchema>
>
