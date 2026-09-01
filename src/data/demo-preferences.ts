import { AccessFlowError } from '../domain/errors'
import type { DemoUser, DemoUserId } from '../domain/models'
import { demoUserIdSchema } from '../domain/schemas'

export const DEMO_USER_PREFERENCE_KEY = 'accessflow.currentDemoUserId'

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

function containsUser(
  users: readonly DemoUser[],
  userId: DemoUserId,
): boolean {
  return users.some((user) => user.id === userId)
}

function ensureDefaultUser(
  users: readonly DemoUser[],
  defaultUserId: DemoUserId,
): void {
  if (!containsUser(users, defaultUserId)) {
    throw new AccessFlowError(
      'CORRUPT_SEED_DATA',
      '默认 Demo 员工不在员工目录中',
    )
  }
}

export class DemoPreferencesAdapter {
  readonly #storage: PreferenceStorage

  constructor(storage: PreferenceStorage) {
    this.#storage = storage
  }

  loadCurrentDemoUserId(
    users: readonly DemoUser[],
    defaultUserId: DemoUserId,
  ): DemoUserId {
    ensureDefaultUser(users, defaultUserId)

    let storedValue: string | null
    try {
      storedValue = this.#storage.getItem(DEMO_USER_PREFERENCE_KEY)
    } catch {
      return defaultUserId
    }

    const parsed = demoUserIdSchema.safeParse(storedValue)
    if (!parsed.success || !containsUser(users, parsed.data)) {
      return defaultUserId
    }

    return parsed.data
  }

  saveCurrentDemoUserId(
    userId: DemoUserId,
    users: readonly DemoUser[],
  ): void {
    const parsed = demoUserIdSchema.safeParse(userId)
    if (!parsed.success || !containsUser(users, parsed.data)) {
      throw new AccessFlowError(
        'VALIDATION_ERROR',
        '当前 Demo 员工不在员工目录中',
        { field: 'currentDemoUserId' },
      )
    }

    try {
      this.#storage.setItem(DEMO_USER_PREFERENCE_KEY, parsed.data)
    } catch {
      throw new AccessFlowError(
        'PERSISTENCE_UNAVAILABLE',
        '无法保存当前 Demo 员工偏好',
      )
    }
  }

  resetCurrentDemoUserId(
    defaultUserId: DemoUserId,
    users: readonly DemoUser[],
  ): void {
    ensureDefaultUser(users, defaultUserId)
    this.saveCurrentDemoUserId(defaultUserId, users)
  }
}
