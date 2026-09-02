import { expect, test, type Page } from '@playwright/test'

import { resetDemoDataThroughUi } from './support/demo-ui'

function dateAfterToday(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function findRequestFromList(
  page: Page,
  options: Readonly<{
    linkName: string
    risk: 'High' | 'Low' | 'Medium'
    search: string
    status: 'Approved' | 'Pending' | 'Rejected'
  }>,
): Promise<void> {
  const search = page.getByLabel('搜索申请人或资源')
  await search.fill(options.search)
  await page.getByRole('button', { name: '搜索' }).focus()
  await page.keyboard.press('Enter')
  await page.getByLabel('申请状态').selectOption(options.status)
  await page.getByLabel('风险等级').selectOption(options.risk)

  const requestLink = page.getByRole('link', { name: options.linkName })
  await expect(requestLink).toBeVisible()
  await requestLink.focus()
  await page.keyboard.press('Enter')
}

test.describe('AccessFlow 核心业务闭环', () => {
  test('员工仅通过可见 UI 和键盘主路径创建、查找并批准申请', async ({
    context,
    page,
  }) => {
    test.setTimeout(60_000)
    await resetDemoDataThroughUi(page)

    await test.step('申请人连续填写表单并得到 Gateway 返回的 Pending 详情', async () => {
      const createLink = page.getByRole('link', { name: '创建申请' })
      await createLink.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/requests\/new$/)
      await expect(
        page.getByRole('heading', { name: '创建权限申请' }),
      ).toBeVisible()

      await page.getByLabel('目标资源').selectOption('resource-deployment')
      await page
        .getByLabel('请求的权限级别')
        .selectOption('permission-manage')
      await page.getByLabel('访问截止日期').fill(dateAfterToday(30))
      await page
        .getByLabel('申请原因')
        .fill('验证 AccessFlow 核心端到端审批闭环')
      const submit = page.getByRole('button', { name: '提交权限申请' })
      await submit.focus()
      await page.keyboard.press('Enter')

      await expect(page).toHaveURL(/\/requests\/(?!new(?:$|\?))[^/?]+$/)
      await expect(page.getByLabel('创建成功')).toBeVisible()
      await expect(page.getByText('待审批（Pending）')).toBeVisible()
      await expect(page.getByText('高风险（High）')).toBeVisible()
      await expect(
        page.getByRole('region', { name: '申请概览' }),
      ).toContainText('Carol Wang')
      await expect(page.getByLabel('当前下一步')).toContainText(
        '负责审批员工核对申请并作出决定',
      )
    })

    const createdRequestUrl = page.url()

    await test.step('刷新后从 IndexedDB 恢复创建结果，并通过 URL 查询找到申请', async () => {
      await page.reload()
      await expect(page).toHaveURL(createdRequestUrl)
      await expect(page.getByText('待审批（Pending）')).toBeVisible()
      await expect(
        page.getByText('验证 AccessFlow 核心端到端审批闭环'),
      ).toBeVisible()

      const reopenedPage = await context.newPage()
      await reopenedPage.goto(createdRequestUrl)
      await expect(reopenedPage.getByText('待审批（Pending）')).toBeVisible()
      await expect(
        reopenedPage.getByText('验证 AccessFlow 核心端到端审批闭环'),
      ).toBeVisible()
      await reopenedPage.close()

      const listLink = page.getByRole('link', { name: '申请列表' })
      await listLink.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/requests$/)
      await findRequestFromList(page, {
        linkName: '查看 Alice Chen 的生产部署后台申请',
        risk: 'High',
        search: '生产部署后台',
        status: 'Pending',
      })
      await expect(page).toHaveURL(createdRequestUrl)
    })

    await test.step('切换到实际负责审批员工并完成批准', async () => {
      await page.getByLabel('当前演示员工').selectOption('user-carol')
      await expect(page).toHaveURL(/\/requests$/)
      await findRequestFromList(page, {
        linkName: '查看 Alice Chen 的生产部署后台申请',
        risk: 'High',
        search: 'Alice Chen',
        status: 'Pending',
      })

      const approve = page.getByRole('button', { name: '批准申请' })
      await approve.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByText('申请已批准。')).toBeVisible()
      await expect(page.getByText('已批准（Approved）')).toBeVisible()
      await expect(page.getByText('审批结果：已批准')).toBeVisible()
    })

    await test.step('刷新保持唯一终态，切回申请人查看最终结果', async () => {
      await page.reload()
      await expect(page.getByText('已批准（Approved）')).toBeVisible()
      await expect(page.getByText('审批结果：已批准')).toBeVisible()

      await page.getByLabel('当前演示员工').selectOption('user-alice')
      await expect(page).toHaveURL(/\/requests$/)
      await findRequestFromList(page, {
        linkName: '查看 Alice Chen 的生产部署后台申请',
        risk: 'High',
        search: '生产部署后台',
        status: 'Approved',
      })

      await expect(page).toHaveURL(createdRequestUrl)
      await expect(page.getByText('已批准（Approved）')).toBeVisible()
      await expect(page.getByText('高风险（High）')).toBeVisible()
      await expect(page.getByText('审批结果：已批准')).toBeVisible()
      await expect(page.getByLabel('当前下一步')).toContainText(
        '审批已完成，无需进一步处理',
      )
      await expect(
        page.getByRole('button', { name: '批准申请' }),
      ).toHaveCount(0)
    })
  })
})
