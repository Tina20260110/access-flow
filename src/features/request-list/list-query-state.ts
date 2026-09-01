import { z } from 'zod'

import type {
  ListQueryState,
  RequestStatus,
  RiskLevel,
} from '../../domain/models'
import {
  requestStatusSchema,
  riskLevelSchema,
} from '../../domain/schemas'

const searchSchema = z.string().trim()
const pageParamSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .refine((page) => Number.isSafeInteger(page) && page > 0)

export const listQueryStateSchema = z
  .strictObject({
    search: searchSchema,
    status: requestStatusSchema.nullable(),
    riskLevel: riskLevelSchema.nullable(),
    page: z.number().int().positive().refine(Number.isSafeInteger),
  })
  .readonly()

export function parseListQuery(searchParams: URLSearchParams): ListQueryState {
  const search = searchSchema.parse(searchParams.get('q') ?? '')
  const statusResult = requestStatusSchema.safeParse(searchParams.get('status'))
  const riskResult = riskLevelSchema.safeParse(searchParams.get('risk'))
  const pageResult = pageParamSchema.safeParse(searchParams.get('page'))

  return {
    search,
    status: statusResult.success ? statusResult.data : null,
    riskLevel: riskResult.success ? riskResult.data : null,
    page: pageResult.success ? pageResult.data : 1,
  }
}

export function serializeListQuery(state: ListQueryState): URLSearchParams {
  const normalized = listQueryStateSchema.parse(state)
  const searchParams = new URLSearchParams()

  if (normalized.search) searchParams.set('q', normalized.search)
  if (normalized.status) searchParams.set('status', normalized.status)
  if (normalized.riskLevel) searchParams.set('risk', normalized.riskLevel)
  if (normalized.page !== 1) searchParams.set('page', String(normalized.page))

  return searchParams
}

export function isCanonicalListQuery(
  searchParams: URLSearchParams,
): boolean {
  return (
    searchParams.toString() ===
    serializeListQuery(parseListQuery(searchParams)).toString()
  )
}

export function setListQuerySearch(
  state: ListQueryState,
  search: string,
): ListQueryState {
  const normalizedSearch = searchSchema.parse(search)
  if (normalizedSearch === state.search) return state

  return { ...state, search: normalizedSearch, page: 1 }
}

export function setListQueryStatus(
  state: ListQueryState,
  status: RequestStatus | null,
): ListQueryState {
  if (status === state.status) return state

  return { ...state, status, page: 1 }
}

export function setListQueryRiskLevel(
  state: ListQueryState,
  riskLevel: RiskLevel | null,
): ListQueryState {
  if (riskLevel === state.riskLevel) return state

  return { ...state, riskLevel, page: 1 }
}

export function setListQueryPage(
  state: ListQueryState,
  page: number,
): ListQueryState {
  const normalizedPage = Number.isSafeInteger(page) && page > 0 ? page : 1
  if (normalizedPage === state.page) return state

  return { ...state, page: normalizedPage }
}
