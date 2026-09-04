import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
} from 'idb'

import { AccessFlowError, isAccessFlowError } from '../domain/errors'
import type {
  ApproveAccessRequestCommand,
  ApprovedAccessRequest,
  CreateAccessRequestCommand,
  DateOnly,
  DemoUser,
  Page,
  PendingAccessRequest,
  PersistedDemoState,
  RejectAccessRequestCommand,
  RejectedAccessRequest,
  ResourceCatalog,
} from '../domain/models'
import { dateOnlySchema, parsePersistedDemoState } from '../domain/schemas'
import {
  applyApproveAccessRequest,
  applyCreateAccessRequest,
  applyRejectAccessRequest,
  defaultGatewayRuntime,
  readAccessRequestDetails,
  readAccessRequestList,
  readDemoUsers,
  readResourceCatalog,
  type AccessFlowGateway,
  type AccessRequestDetails,
  type AccessRequestSummary,
  type GatewayRuntime,
  type GatewayStateChange,
  type GetAccessRequestInput,
  type ListAccessRequestsInput,
} from './access-flow-gateway'
import { createSeedState } from './seed-data'

const DATABASE_VERSION = 1
const STORE_NAME = 'demo-state'
const ROOT_DOCUMENT_KEY = 'root'

interface AccessFlowDatabase extends DBSchema {
  'demo-state': {
    key: typeof ROOT_DOCUMENT_KEY
    value: unknown
  }
}

type IndexedDbGatewayOptions = Readonly<{
  databaseName?: string
  initialState?: unknown
  runtime?: GatewayRuntime
}>

type RootWriteTransaction = IDBPTransaction<
  AccessFlowDatabase,
  [typeof STORE_NAME],
  'readwrite'
>

function getLocalDateOnly(date: Date): DateOnly {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return dateOnlySchema.parse(`${year}-${month}-${day}`)
}

function rethrowGatewayError(error: unknown): never {
  if (isAccessFlowError(error)) throw error
  throw new AccessFlowError(
    'PERSISTENCE_UNAVAILABLE',
    '浏览器持久化当前不可用',
  )
}

async function abortAfterDomainFailure(
  transaction: RootWriteTransaction,
): Promise<void> {
  try {
    transaction.abort()
  } catch {
    // 请求失败时事务可能已经自动终止，此时无需再次中止。
  }
  await transaction.done.catch(() => undefined)
}

export class IndexedDbAccessFlowGateway implements AccessFlowGateway {
  readonly #databaseName: string

  readonly #initialState: unknown

  readonly #runtime: GatewayRuntime

  #databasePromise: Promise<IDBPDatabase<AccessFlowDatabase>> | null = null

  #initializationPromise: Promise<void> | null = null

  constructor(options: IndexedDbGatewayOptions = {}) {
    this.#databaseName = options.databaseName ?? 'access-flow'
    this.#runtime = options.runtime ?? defaultGatewayRuntime
    this.#initialState =
      options.initialState ??
      createSeedState(getLocalDateOnly(this.#runtime.now()))
  }

  async #getDatabase(): Promise<IDBPDatabase<AccessFlowDatabase>> {
    this.#databasePromise ??= openDB<AccessFlowDatabase>(
      this.#databaseName,
      DATABASE_VERSION,
      {
        upgrade(database) {
          database.createObjectStore(STORE_NAME)
        },
      },
    )

    try {
      return await this.#databasePromise
    } catch (error: unknown) {
      return rethrowGatewayError(error)
    }
  }

  async #ensureInitialized(): Promise<void> {
    this.#initializationPromise ??= this.#initializeMissingRoot()
    try {
      await this.#initializationPromise
    } catch (error: unknown) {
      this.#initializationPromise = null
      rethrowGatewayError(error)
    }
  }

  async #initializeMissingRoot(): Promise<void> {
    const database = await this.#getDatabase()
    const transaction = database.transaction(STORE_NAME, 'readwrite')

    try {
      const stored = await transaction.store.get(ROOT_DOCUMENT_KEY)
      if (stored === undefined) {
        const initialState = parsePersistedDemoState(this.#initialState)
        await transaction.store.put(initialState, ROOT_DOCUMENT_KEY)
      } else {
        parsePersistedDemoState(stored)
      }
      await transaction.done
    } catch (error: unknown) {
      await abortAfterDomainFailure(transaction)
      rethrowGatewayError(error)
    }
  }

  async #readState(): Promise<PersistedDemoState> {
    await this.#ensureInitialized()
    try {
      const database = await this.#getDatabase()
      const stored = await database.get(STORE_NAME, ROOT_DOCUMENT_KEY)
      if (stored === undefined) {
        throw new AccessFlowError(
          'CORRUPT_DEMO_DATA',
          'Demo 根文档不存在',
        )
      }
      return parsePersistedDemoState(stored)
    } catch (error: unknown) {
      return rethrowGatewayError(error)
    }
  }

  async #writeFromLatest<T>(
    changeState: (state: unknown) => GatewayStateChange<T>,
  ): Promise<T> {
    await this.#ensureInitialized()
    const database = await this.#getDatabase()
    const transaction = database.transaction(STORE_NAME, 'readwrite')

    try {
      const stored = await transaction.store.get(ROOT_DOCUMENT_KEY)
      if (stored === undefined) {
        throw new AccessFlowError(
          'CORRUPT_DEMO_DATA',
          'Demo 根文档不存在',
        )
      }

      // 最新读取、领域转换和写回必须留在同一事务，旧 revision 才无法覆盖先提交的终态。
      const change = changeState(stored)
      const trustedState = parsePersistedDemoState(change.state)
      await transaction.store.put(trustedState, ROOT_DOCUMENT_KEY)
      await transaction.done
      return change.result
    } catch (error: unknown) {
      await abortAfterDomainFailure(transaction)
      return rethrowGatewayError(error)
    }
  }

  async getDemoUsers(): Promise<readonly DemoUser[]> {
    return readDemoUsers(await this.#readState())
  }

  async getResources(): Promise<ResourceCatalog> {
    return readResourceCatalog(await this.#readState())
  }

  async listAccessRequests(
    input: ListAccessRequestsInput,
  ): Promise<Page<AccessRequestSummary>> {
    return readAccessRequestList(await this.#readState(), input)
  }

  async getAccessRequest(
    input: GetAccessRequestInput,
  ): Promise<AccessRequestDetails> {
    return readAccessRequestDetails(await this.#readState(), input)
  }

  async createAccessRequest(
    command: CreateAccessRequestCommand,
  ): Promise<PendingAccessRequest> {
    return this.#writeFromLatest((state) =>
      applyCreateAccessRequest(state, command, this.#runtime),
    )
  }

  async approveAccessRequest(
    command: ApproveAccessRequestCommand,
  ): Promise<ApprovedAccessRequest> {
    return this.#writeFromLatest((state) =>
      applyApproveAccessRequest(state, command, this.#runtime),
    )
  }

  async rejectAccessRequest(
    command: RejectAccessRequestCommand,
  ): Promise<RejectedAccessRequest> {
    return this.#writeFromLatest((state) =>
      applyRejectAccessRequest(state, command, this.#runtime),
    )
  }

  async resetDemoData(): Promise<void> {
    const resetState = createSeedState(getLocalDateOnly(this.#runtime.now()))
    const database = await this.#getDatabase()
    const transaction = database.transaction(STORE_NAME, 'readwrite')

    try {
      // 显式恢复必须能覆盖无法解析的根文档，但普通读取仍绝不会自动重置。
      await transaction.store.put(resetState, ROOT_DOCUMENT_KEY)
      await transaction.done
    } catch (error: unknown) {
      await abortAfterDomainFailure(transaction)
      rethrowGatewayError(error)
    }
  }

  async close(): Promise<void> {
    if (!this.#databasePromise) return
    const database = await this.#databasePromise
    database.close()
  }
}
