import { AccessFlowError } from '../domain/errors'
import type {
  ApproveAccessRequestCommand,
  ApprovedAccessRequest,
  CreateAccessRequestCommand,
  DemoUser,
  Page,
  PendingAccessRequest,
  RejectAccessRequestCommand,
  RejectedAccessRequest,
  ResourceCatalog,
} from '../domain/models'
import type {
  AccessFlowGateway,
  AccessRequestDetails,
  AccessRequestSummary,
  GetAccessRequestInput,
  ListAccessRequestsInput,
} from './access-flow-gateway'

export const DEMO_TRANSPORT_OPERATIONS = [
  'getDemoUsers',
  'getResources',
  'listAccessRequests',
  'getAccessRequest',
  'createAccessRequest',
  'approveAccessRequest',
  'rejectAccessRequest',
  'resetDemoData',
] as const

export type DemoTransportOperation =
  (typeof DEMO_TRANSPORT_OPERATIONS)[number]

export class DeterministicFaultController {
  #nextFailure: DemoTransportOperation | null = null

  failNext(operation: DemoTransportOperation): void {
    this.#nextFailure = operation
  }

  consumeFailure(operation: DemoTransportOperation): boolean {
    if (this.#nextFailure !== operation) return false
    this.#nextFailure = null
    return true
  }
}

type DemoTransportOptions = Readonly<{
  queryDelayMs?: number
  mutationDelayMs?: number
  faultController?: DeterministicFaultController
}>

const MUTATION_OPERATIONS = new Set<DemoTransportOperation>([
  'createAccessRequest',
  'approveAccessRequest',
  'rejectAccessRequest',
  'resetDemoData',
])

function ensureDelay(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new AccessFlowError(
      'VALIDATION_ERROR',
      'Demo Transport 延迟必须是非负有限数值',
    )
  }
  return value
}

function wait(delayMs: number): Promise<void> {
  if (delayMs === 0) return Promise.resolve()
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs)
  })
}

export class DemoTransport implements AccessFlowGateway {
  readonly #gateway: AccessFlowGateway

  readonly #queryDelayMs: number

  readonly #mutationDelayMs: number

  readonly #faultController: DeterministicFaultController | undefined

  constructor(gateway: AccessFlowGateway, options: DemoTransportOptions = {}) {
    this.#gateway = gateway
    this.#queryDelayMs = ensureDelay(options.queryDelayMs ?? 200)
    this.#mutationDelayMs = ensureDelay(options.mutationDelayMs ?? 350)
    this.#faultController = options.faultController
  }

  async #invoke<T>(
    operation: DemoTransportOperation,
    execute: () => Promise<T>,
  ): Promise<T> {
    const delayMs = MUTATION_OPERATIONS.has(operation)
      ? this.#mutationDelayMs
      : this.#queryDelayMs

    // 计时器和故障先于底层调用，避免延长 IndexedDB 事务或在事务中注入异步失败。
    await wait(delayMs)
    if (this.#faultController?.consumeFailure(operation) === true) {
      throw new AccessFlowError(
        'TRANSIENT_FAILURE',
        '演示操作按预设发生了一次瞬时失败',
        { operation },
      )
    }
    return execute()
  }

  getDemoUsers(): Promise<readonly DemoUser[]> {
    return this.#invoke('getDemoUsers', () => this.#gateway.getDemoUsers())
  }

  getResources(): Promise<ResourceCatalog> {
    return this.#invoke('getResources', () => this.#gateway.getResources())
  }

  listAccessRequests(
    input: ListAccessRequestsInput,
  ): Promise<Page<AccessRequestSummary>> {
    return this.#invoke('listAccessRequests', () =>
      this.#gateway.listAccessRequests(input),
    )
  }

  getAccessRequest(
    input: GetAccessRequestInput,
  ): Promise<AccessRequestDetails> {
    return this.#invoke('getAccessRequest', () =>
      this.#gateway.getAccessRequest(input),
    )
  }

  createAccessRequest(
    command: CreateAccessRequestCommand,
  ): Promise<PendingAccessRequest> {
    return this.#invoke('createAccessRequest', () =>
      this.#gateway.createAccessRequest(command),
    )
  }

  approveAccessRequest(
    command: ApproveAccessRequestCommand,
  ): Promise<ApprovedAccessRequest> {
    return this.#invoke('approveAccessRequest', () =>
      this.#gateway.approveAccessRequest(command),
    )
  }

  rejectAccessRequest(
    command: RejectAccessRequestCommand,
  ): Promise<RejectedAccessRequest> {
    return this.#invoke('rejectAccessRequest', () =>
      this.#gateway.rejectAccessRequest(command),
    )
  }

  resetDemoData(): Promise<void> {
    return this.#invoke('resetDemoData', () => this.#gateway.resetDemoData())
  }
}
