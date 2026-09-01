import { describe, expect, it } from 'vitest'

import { rejectRequestFormSchema } from './reject-request.schema'

describe('拒绝申请表单 schema', () => {
  it('拒绝空值与纯空白原因并提供明确错误', () => {
    expect(
      rejectRequestFormSchema.safeParse({ rejectionReason: '' }),
    ).toMatchObject({
      success: false,
      error: {
        issues: [
          expect.objectContaining({
            message: '请填写拒绝原因',
            path: ['rejectionReason'],
          }),
        ],
      },
    })
    expect(
      rejectRequestFormSchema.safeParse({ rejectionReason: '   ' }).success,
    ).toBe(false)
  })

  it('输出可直接注入拒绝 command 的 trim 后原因', () => {
    expect(
      rejectRequestFormSchema.parse({
        rejectionReason: '  缺少业务负责人确认  ',
      }),
    ).toEqual({ rejectionReason: '缺少业务负责人确认' })
  })

  it('拒绝表单以外的字段不能越过边界', () => {
    expect(
      rejectRequestFormSchema.safeParse({
        rejectionReason: '权限范围过大',
        expectedRevision: 99,
      }).success,
    ).toBe(false)
  })
})
