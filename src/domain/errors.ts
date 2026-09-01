export const ACCESS_FLOW_ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'FORBIDDEN',
  'UNMAPPED_PERMISSION',
  'NO_ELIGIBLE_APPROVER',
  'EXPIRED_REQUEST',
  'CONFLICT',
  'PERSISTENCE_UNAVAILABLE',
  'CORRUPT_DEMO_DATA',
  'CORRUPT_SEED_DATA',
  'TRANSIENT_FAILURE',
] as const

export type AccessFlowErrorCode = (typeof ACCESS_FLOW_ERROR_CODES)[number]

export type AccessFlowErrorDetails = Readonly<
  Record<string, string | number | boolean | null>
>

export class AccessFlowError extends Error {
  override readonly name = 'AccessFlowError'

  readonly code: AccessFlowErrorCode

  readonly details: AccessFlowErrorDetails

  constructor(
    code: AccessFlowErrorCode,
    message: string,
    details: AccessFlowErrorDetails = {},
  ) {
    super(message)
    this.code = code
    this.details = details
  }
}

export function isAccessFlowError(error: unknown): error is AccessFlowError {
  return error instanceof AccessFlowError
}
