import type { Page } from '@playwright/test'

import type { PersistedDemoState } from '../../src/domain/models'

export async function replaceDemoStateForTest(
  page: Page,
  state: PersistedDemoState,
): Promise<void> {
  // 仅用于性能测试的数据初始化；应用重新加载后仍必须由生产 Gateway 校验并读取这份数据。
  await page.evaluate(async (nextState) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('access-flow', 1)
      request.onerror = () => {
        reject(new Error(request.error?.message ?? '无法打开性能测试数据库'))
      }
      request.onsuccess = () => {
        resolve(request.result)
      }
    })

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('demo-state', 'readwrite')
      transaction.onerror = () => {
        reject(
          new Error(transaction.error?.message ?? '无法写入性能测试数据'),
        )
      }
      transaction.oncomplete = () => {
        resolve()
      }
      transaction.objectStore('demo-state').put(nextState, 'root')
    })
    database.close()
  }, state)
}
