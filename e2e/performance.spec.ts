import { expect, test, type Page } from '@playwright/test'

import type {
  PersistedDemoState,
  RequestStatus,
  RiskLevel,
} from '../src/domain/models'
import { createScaleFixtureState } from '../src/test/fixtures'
import { replaceDemoStateForTest } from './support/indexed-db-fixture'

const SAMPLE_COUNT = 20
const PERFORMANCE_LIMIT_MS = 2_000

type OperationName = '文本搜索' | '状态筛选' | '风险筛选' | '组合筛选' | '翻页'

type QueryFilter = Readonly<{
  riskLevel?: RiskLevel
  search?: string
  status?: RequestStatus
}>

function matchingCount(
  state: PersistedDemoState,
  filter: QueryFilter,
): number {
  const usersById = new Map(state.users.map((user) => [user.id, user]))
  const resourcesById = new Map(
    state.resources.map((resource) => [resource.id, resource]),
  )
  const search = filter.search?.trim().toLocaleLowerCase('zh-CN') ?? ''

  return state.accessRequests.filter((request) => {
    if (filter.status !== undefined && request.status !== filter.status) {
      return false
    }
    if (
      filter.riskLevel !== undefined &&
      request.riskLevel !== filter.riskLevel
    ) {
      return false
    }
    if (search === '') return true

    const requester = usersById.get(request.requesterId)
    const resource = resourcesById.get(request.resourceId)
    return [requester?.displayName, resource?.displayName].some((value) =>
      value?.toLocaleLowerCase('zh-CN').includes(search),
    )
  }).length
}

async function expectResultCount(page: Page, count: number): Promise<void> {
  await expect(page.getByText(`共 ${String(count)} 条申请`)).toBeVisible()
  await expect(page.getByText('正在更新申请列表…')).toBeHidden()
}

async function measure(
  page: Page,
  action: () => Promise<void>,
  resultVisible: () => Promise<void>,
): Promise<number> {
  const start = await page.evaluate(() => performance.now())
  await action()
  await resultVisible()
  const end = await page.evaluate(() => performance.now())
  return end - start
}

function percentile95(samples: readonly number[]): number {
  const ordered = [...samples].sort((left, right) => left - right)
  const index = Math.ceil(ordered.length * 0.95) - 1
  const value = ordered.at(index)
  if (value === undefined) throw new Error('性能样本不能为空')
  return value
}

async function resetListQuery(page: Page): Promise<void> {
  await page.goto('/requests')
  await expectResultCount(page, 1_000)
}

test('SC-003：1,000 条可见申请的列表交互 P95 不超过 2 秒', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const fixture = createScaleFixtureState(1_000)
  const samples: Record<OperationName, number[]> = {
    文本搜索: [],
    状态筛选: [],
    风险筛选: [],
    组合筛选: [],
    翻页: [],
  }

  await page.goto('/requests')
  await expect(
    page.getByRole('heading', { name: '申请列表' }),
  ).toBeVisible()
  await replaceDemoStateForTest(page, fixture)
  await page.reload()
  await expect(page.getByLabel('当前演示员工')).toHaveValue('user-alice')
  await expectResultCount(page, 1_000)

  await test.step('文本搜索 20 次', async () => {
    const searchField = page.getByLabel('搜索申请人或资源')
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const search = index % 2 === 0 ? 'Alice Chen' : '数据分析平台'
      await searchField.fill(search)
      samples.文本搜索.push(
        await measure(
          page,
          () => page.getByRole('button', { name: '搜索' }).click(),
          () => expectResultCount(page, matchingCount(fixture, { search })),
        ),
      )
    }
  })

  await resetListQuery(page)
  await test.step('状态筛选 20 次', async () => {
    const statusField = page.getByLabel('申请状态')
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const status: RequestStatus = index % 2 === 0 ? 'Pending' : 'Approved'
      samples.状态筛选.push(
        await measure(
          page,
          async () => {
            await statusField.selectOption(status)
          },
          () => expectResultCount(page, matchingCount(fixture, { status })),
        ),
      )
    }
  })

  await resetListQuery(page)
  await test.step('风险筛选 20 次', async () => {
    const riskField = page.getByLabel('风险等级')
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const riskLevel: RiskLevel = index % 2 === 0 ? 'Low' : 'High'
      samples.风险筛选.push(
        await measure(
          page,
          async () => {
            await riskField.selectOption(riskLevel)
          },
          () =>
            expectResultCount(page, matchingCount(fixture, { riskLevel })),
        ),
      )
    }
  })

  await resetListQuery(page)
  await test.step('组合筛选 20 次', async () => {
    const searchField = page.getByLabel('搜索申请人或资源')
    const statusField = page.getByLabel('申请状态')
    const riskField = page.getByLabel('风险等级')
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const filter: Required<QueryFilter> =
        index % 2 === 0
          ? { riskLevel: 'Low', search: 'Alice Chen', status: 'Pending' }
          : { riskLevel: 'High', search: 'Bob Li', status: 'Rejected' }
      await resetListQuery(page)
      await searchField.fill(filter.search)
      samples.组合筛选.push(
        await measure(
          page,
          async () => {
            await page.getByRole('button', { name: '搜索' }).click()
            await expect(page).toHaveURL(
              (url) => url.searchParams.get('q') === filter.search,
            )
            await expectResultCount(
              page,
              matchingCount(fixture, { search: filter.search }),
            )
            await statusField.selectOption(filter.status)
            await expectResultCount(
              page,
              matchingCount(fixture, {
                search: filter.search,
                status: filter.status,
              }),
            )
            await riskField.selectOption(filter.riskLevel)
          },
          () => expectResultCount(page, matchingCount(fixture, filter)),
        ),
      )
    }
  })

  await resetListQuery(page)
  await test.step('翻页 20 次', async () => {
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const targetPage = index % 2 === 0 ? 2 : 1
      const buttonName = targetPage === 2 ? '下一页' : '上一页'
      samples.翻页.push(
        await measure(
          page,
          () => page.getByRole('button', { name: buttonName }).click(),
          async () => {
            await expect(
              page.getByText(`第 ${String(targetPage)} / 100 页`),
            ).toBeVisible()
            await expect(page.getByText('正在更新申请列表…')).toBeHidden()
          },
        ),
      )
    }
  })

  const categoryP95 = Object.fromEntries(
    Object.entries(samples).map(([name, values]) => [
      name,
      Number(percentile95(values).toFixed(1)),
    ]),
  )
  const allSamples = Object.values(samples).flat()
  const aggregateP95 = Number(percentile95(allSamples).toFixed(1))
  const report = {
    aggregateP95Ms: aggregateP95,
    categoryP95Ms: categoryP95,
    environment: 'Google Chrome (Chromium) + Vite production preview',
    fixtureCount: fixture.accessRequests.length,
    sampleCount: allSamples.length,
  }

  await testInfo.attach('sc-003-performance.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  })
  console.log(`SC-003_RESULT ${JSON.stringify(report)}`)
  expect(aggregateP95).toBeLessThanOrEqual(PERFORMANCE_LIMIT_MS)
})
