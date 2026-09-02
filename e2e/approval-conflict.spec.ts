import { expect, test, type Page } from '@playwright/test'

import { resetDemoDataThroughUi } from './support/demo-ui'

const pendingRequestPath = '/requests/request-pending-high'

function requestOverview(page: Page) {
  return page.getByRole('region', { name: '申请概览' })
}

test.describe('审批 revision 冲突', () => {
  test('两个页面读取同一 revision 时只允许首个决定生效', async ({
    context,
    page: pageA,
  }) => {
    test.setTimeout(60_000)
    await resetDemoDataThroughUi(pageA)
    await pageA.getByLabel('当前演示员工').selectOption('user-bob')
    await pageA.goto(pendingRequestPath)
    await expect(pageA.getByText('待审批（Pending）')).toBeVisible()
    await expect(requestOverview(pageA)).toContainText(/申请版本\s*1/)
    await expect(
      pageA.getByRole('button', { name: '批准申请' }),
    ).toBeVisible()

    const pageB = await context.newPage()
    await pageB.goto(pendingRequestPath)
    await expect(pageB.getByText('待审批（Pending）')).toBeVisible()
    await expect(requestOverview(pageB)).toContainText(/申请版本\s*1/)
    await expect(
      pageB.getByRole('button', { name: '拒绝申请' }),
    ).toBeVisible()

    await test.step('Page A 以 revision 1 提交首个有效决定', async () => {
      await pageA.getByRole('button', { name: '批准申请' }).click()
      await expect(pageA.getByText('申请已批准。')).toBeVisible()
      await expect(pageA.getByText('已批准（Approved）')).toBeVisible()
      await expect(requestOverview(pageA)).toContainText(/申请版本\s*2/)
      await expect(pageA.getByText('审批结果：已批准')).toHaveCount(1)
    })

    await test.step('Page B 的 stale revision 1 决定收到冲突且不会自动重试', async () => {
      await pageB.getByRole('button', { name: '拒绝申请' }).click()
      const rejectDialog = pageB.getByRole('dialog', {
        name: '拒绝权限申请',
      })
      await expect(rejectDialog).toBeVisible()
      await rejectDialog
        .getByLabel('拒绝原因')
        .fill('使用旧版本提交的冲突决定')
      await rejectDialog.getByRole('button', { name: '确认拒绝' }).click()

      await expect(
        pageB.getByRole('alert').filter({
          hasText: '申请已经发生变化或已被处理，已重新获取最新状态。',
        }),
      ).toBeVisible()
      await expect(pageB.getByText('已批准（Approved）')).toBeVisible()
      await expect(pageB.getByText('审批结果：已批准')).toHaveCount(1)
      await expect(pageB.getByText('使用旧版本提交的冲突决定')).toHaveCount(
        0,
      )
      await expect(
        pageB.getByRole('button', { name: '确认拒绝' }),
      ).toHaveCount(0)
    })

    await test.step('重新加载和新页面都从 IndexedDB 恢复同一个终态', async () => {
      await pageB.reload()
      await expect(pageB.getByText('已批准（Approved）')).toBeVisible()
      await expect(pageB.getByText('审批结果：已批准')).toHaveCount(1)
      await expect(requestOverview(pageB)).toContainText(/申请版本\s*2/)

      const reopenedPage = await context.newPage()
      await reopenedPage.goto(pendingRequestPath)
      await expect(reopenedPage.getByText('已批准（Approved）')).toBeVisible()
      await expect(reopenedPage.getByText('审批结果：已批准')).toHaveCount(1)

      await resetDemoDataThroughUi(reopenedPage)
      await reopenedPage
        .getByLabel('当前演示员工')
        .selectOption('user-bob')
      await reopenedPage.goto(pendingRequestPath)
      await expect(reopenedPage.getByText('待审批（Pending）')).toBeVisible()
      await expect(requestOverview(reopenedPage)).toContainText(
        /申请版本\s*1/,
      )
      await expect(reopenedPage.getByText('暂无审批记录')).toBeVisible()
    })
  })
})
