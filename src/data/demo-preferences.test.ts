import { beforeEach, describe, expect, it } from 'vitest'

import { AccessFlowError } from '../domain/errors'
import { dateOnlySchema, demoUserIdSchema } from '../domain/schemas'
import {
  DEMO_USER_PREFERENCE_KEY,
  DemoPreferencesAdapter,
} from './demo-preferences'
import { createSeedState, DEFAULT_DEMO_USER_ID } from './seed-data'

const users = createSeedState(dateOnlySchema.parse('2026-09-01')).users
const otherUserId = demoUserIdSchema.parse('user-bob')

class TestPreferenceStorage {
  readonly #values = new Map<string, string>()

  get length(): number {
    return this.#values.size
  }

  clear(): void {
    this.#values.clear()
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value)
  }
}

describe('DemoPreferencesAdapter', () => {
  const storage = new TestPreferenceStorage()

  beforeEach(() => {
    storage.clear()
  })

  it('只保存并恢复合法的 currentDemoUserId', () => {
    const preferences = new DemoPreferencesAdapter(storage)

    preferences.saveCurrentDemoUserId(otherUserId, users)

    expect(storage.length).toBe(1)
    expect(storage.getItem(DEMO_USER_PREFERENCE_KEY)).toBe(otherUserId)
    expect(
      preferences.loadCurrentDemoUserId(users, DEFAULT_DEMO_USER_ID),
    ).toBe(otherUserId)
  })

  it.each(['missing-user', '   ', '{broken-json'])(
    '未知或损坏偏好 %s 回退到默认员工',
    (storedValue) => {
      storage.setItem(DEMO_USER_PREFERENCE_KEY, storedValue)
      const preferences = new DemoPreferencesAdapter(storage)

      expect(
        preferences.loadCurrentDemoUserId(users, DEFAULT_DEMO_USER_ID),
      ).toBe(DEFAULT_DEMO_USER_ID)
    },
  )

  it('没有保存值时使用默认员工', () => {
    const preferences = new DemoPreferencesAdapter(storage)

    expect(
      preferences.loadCurrentDemoUserId(users, DEFAULT_DEMO_USER_ID),
    ).toBe(DEFAULT_DEMO_USER_ID)
  })

  it('重置时恢复确定的默认员工', () => {
    const preferences = new DemoPreferencesAdapter(storage)
    preferences.saveCurrentDemoUserId(otherUserId, users)

    preferences.resetCurrentDemoUserId(DEFAULT_DEMO_USER_ID, users)

    expect(storage.getItem(DEMO_USER_PREFERENCE_KEY)).toBe(
      DEFAULT_DEMO_USER_ID,
    )
  })

  it('拒绝保存不在 Demo Users 中的员工 ID', () => {
    const preferences = new DemoPreferencesAdapter(storage)
    const unknownUserId = demoUserIdSchema.parse('missing-user')

    expect(() => {
      preferences.saveCurrentDemoUserId(unknownUserId, users)
    }).toThrow(AccessFlowError)
    expect(storage.getItem(DEMO_USER_PREFERENCE_KEY)).toBeNull()
  })
})
