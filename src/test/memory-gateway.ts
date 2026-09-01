import type {
  AccessFlowGateway,
  GatewayRuntime,
  GetAccessRequestInput,
  ListAccessRequestsInput,
} from '../data/access-flow-gateway'
import {
  applyApproveAccessRequest,
  applyCreateAccessRequest,
  applyRejectAccessRequest,
  defaultGatewayRuntime,
  readAccessRequestDetails,
  readAccessRequestList,
  readDemoUsers,
  readResourceCatalog,
} from '../data/access-flow-gateway'
import { createSeedState } from '../data/seed-data'
import type {
  ApproveAccessRequestCommand,
  ApprovedAccessRequest,
  CreateAccessRequestCommand,
  DateOnly,
  DemoUser,
  Page,
  PendingAccessRequest,
  RejectAccessRequestCommand,
  RejectedAccessRequest,
  ResourceCatalog,
} from '../domain/models'
import { dateOnlySchema } from '../domain/schemas'
import type {
  AccessRequestDetails,
  AccessRequestSummary,
} from '../data/access-flow-gateway'

type MemoryGatewayOptions = Readonly<{
  initialState?: unknown
  runtime?: GatewayRuntime
}>

function getLocalDateOnly(date: Date): DateOnly {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return dateOnlySchema.parse(`${year}-${month}-${day}`)
}

function settle<T>(operation: () => T): Promise<T> {
  try {
    return Promise.resolve(operation())
  } catch (error: unknown) {
    return Promise.reject(
      error instanceof Error ? error : new Error(String(error)),
    )
  }
}

export class MemoryAccessFlowGateway implements AccessFlowGateway {
  #state: unknown

  readonly #runtime: GatewayRuntime

  constructor(options: MemoryGatewayOptions = {}) {
    this.#runtime = options.runtime ?? defaultGatewayRuntime
    this.#state =
      options.initialState ??
      createSeedState(getLocalDateOnly(this.#runtime.now()))
  }

  getDemoUsers(): Promise<readonly DemoUser[]> {
    return settle(() => readDemoUsers(this.#state))
  }

  getResources(): Promise<ResourceCatalog> {
    return settle(() => readResourceCatalog(this.#state))
  }

  listAccessRequests(
    input: ListAccessRequestsInput,
  ): Promise<Page<AccessRequestSummary>> {
    return settle(() => readAccessRequestList(this.#state, input))
  }

  getAccessRequest(
    input: GetAccessRequestInput,
  ): Promise<AccessRequestDetails> {
    return settle(() => readAccessRequestDetails(this.#state, input))
  }

  createAccessRequest(
    command: CreateAccessRequestCommand,
  ): Promise<PendingAccessRequest> {
    return settle(() => {
      const change = applyCreateAccessRequest(
        this.#state,
        command,
        this.#runtime,
      )
      this.#state = change.state
      return change.result
    })
  }

  approveAccessRequest(
    command: ApproveAccessRequestCommand,
  ): Promise<ApprovedAccessRequest> {
    return settle(() => {
      const change = applyApproveAccessRequest(
        this.#state,
        command,
        this.#runtime,
      )
      this.#state = change.state
      return change.result
    })
  }

  rejectAccessRequest(
    command: RejectAccessRequestCommand,
  ): Promise<RejectedAccessRequest> {
    return settle(() => {
      const change = applyRejectAccessRequest(
        this.#state,
        command,
        this.#runtime,
      )
      this.#state = change.state
      return change.result
    })
  }

  resetDemoData(): Promise<void> {
    return settle(() => {
      this.#state = createSeedState(getLocalDateOnly(this.#runtime.now()))
    })
  }
}
