import { z } from 'zod'

export const rejectRequestFormSchema = z
  .strictObject({
    rejectionReason: z
      .string()
      .trim()
      .min(1, { error: '请填写拒绝原因' }),
  })
  .readonly()

export type RejectRequestFormInput = z.input<typeof rejectRequestFormSchema>
export type RejectRequestFormValues = z.output<typeof rejectRequestFormSchema>
