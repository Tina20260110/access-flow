import { describe, expect, expectTypeOf, it } from 'vitest'

import type { DateOnly, PermissionId, ResourceId } from '../../domain/models'
import { dateOnlySchema } from '../../domain/schemas'
import {
  createRequestFormSchema,
  type CreateRequestFormValues,
} from './create-request.schema'

const today = dateOnlySchema.parse('2026-09-01')
const schema = createRequestFormSchema(today)

const validInput = {
  resourceId: 'resource-analytics',
  permission: 'permission-manage',
  expiresAt: '2026-10-01',
  reason: '排查季度报表数据问题',
}

describe('创建申请表单 schema', () => {
  it('trim 有效输入并只输出 UI 可以提交的四个字段', () => {
    const result = schema.parse({
      resourceId: ' resource-analytics ',
      permission: ' permission-manage ',
      expiresAt: '2026-10-01',
      reason: '  排查季度报表数据问题  ',
    })

    expect(result).toEqual(validInput)
    expect(Object.keys(result)).toEqual([
      'resourceId',
      'permission',
      'expiresAt',
      'reason',
    ])
    expectTypeOf<CreateRequestFormValues>().toEqualTypeOf<
      Readonly<{
        resourceId: ResourceId
        permission: PermissionId
        expiresAt: DateOnly
        reason: string
      }>
    >()
  })

  it.each([
    ['resourceId', { ...validInput, resourceId: '' }],
    ['permission', { ...validInput, permission: '' }],
    ['expiresAt', { ...validInput, expiresAt: '' }],
    ['reason', { ...validInput, reason: '   ' }],
  ])('拒绝缺失或空白的必填字段 %s', (field, input) => {
    const result = schema.safeParse(input)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: [field] })]),
      )
    }
  })

  it.each(['2026-02-30', 'not-a-date'])('拒绝不真实的日期 %s', (expiresAt) => {
    const result = schema.safeParse({ ...validInput, expiresAt })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['expiresAt'])
    }
  })

  it.each(['2026-09-01', '2026-08-31'])(
    '拒绝不晚于提交日的截止日期 %s',
    (expiresAt) => {
      const result = schema.safeParse({ ...validInput, expiresAt })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: '访问截止日期必须晚于提交日',
              path: ['expiresAt'],
            }),
          ]),
        )
      }
    },
  )

  it('拒绝由 Domain 或 Gateway 决定的业务字段', () => {
    const result = schema.safeParse({
      ...validInput,
      approverId: 'user-bob',
      revision: 1,
      riskLevel: 'Low',
      status: 'Pending',
    })

    expect(result.success).toBe(false)
  })
})
