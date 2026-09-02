import { expect, test } from '@playwright/test'

import { resetDemoDataThroughUi } from './support/demo-ui'

test.describe('Quickstart 浏览器验收', () => {
  test('列表查询可刷新、历史恢复、复制地址并规范化重复或非法参数', async ({
    context,
    page,
  }) => {
    await resetDemoDataThroughUi(page)

    await page.getByLabel('搜索申请人或资源').fill('数据分析平台')
    await page.getByRole('button', { name: '搜索' }).click()
    await expect(page).toHaveURL(
      (url) => url.searchParams.get('q') === '数据分析平台',
    )
    await expect(page.getByText('共 1 条申请')).toBeVisible()
    await page.getByLabel('申请状态').selectOption('Pending')
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get('q') === '数据分析平台' &&
        url.searchParams.get('status') === 'Pending',
    )
    await expect(page.getByText('共 1 条申请')).toBeVisible()
    await page.getByLabel('风险等级').selectOption('High')
    await expect(page).toHaveURL(
      /q=%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90%E5%B9%B3%E5%8F%B0&status=Pending&risk=High$/,
    )
    const copiedUrl = page.url()

    await page.reload()
    await expect(page.getByLabel('搜索申请人或资源')).toHaveValue(
      '数据分析平台',
    )
    await expect(page.getByLabel('申请状态')).toHaveValue('Pending')
    await expect(page.getByLabel('风险等级')).toHaveValue('High')

    await page.getByLabel('申请状态').selectOption('Approved')
    await expect(page.getByLabel('申请状态')).toHaveValue('Approved')
    await page.goBack()
    await expect(page.getByLabel('申请状态')).toHaveValue('Pending')
    await page.goForward()
    await expect(page.getByLabel('申请状态')).toHaveValue('Approved')

    const copiedPage = await context.newPage()
    await copiedPage.goto(copiedUrl)
    await expect(copiedPage.getByLabel('申请状态')).toHaveValue('Pending')
    await expect(copiedPage.getByLabel('风险等级')).toHaveValue('High')
    await copiedPage.close()

    await page.goto(
      '/requests?q=Alice&q=Bob&status=Pending&status=Approved&risk=High&risk=Low&page=1&page=2',
    )
    await expect(page).toHaveURL(
      /\/requests\?q=Alice&status=Pending&risk=High$/,
    )
    await expect(page.getByLabel('搜索申请人或资源')).toHaveValue('Alice')
    await expect(page.getByLabel('申请状态')).toHaveValue('Pending')
    await expect(page.getByLabel('风险等级')).toHaveValue('High')

    await page.goto(
      '/requests?q=%20%20&q=Alice&status=unknown&status=Pending&risk=invalid&risk=High&page=0&page=2',
    )
    await expect(page).toHaveURL(/\/requests$/)
    await expect(page.getByLabel('搜索申请人或资源')).toHaveValue('')
    await expect(page.getByLabel('申请状态')).toHaveValue('')
    await expect(page.getByLabel('风险等级')).toHaveValue('')

    await page.goto('/requests?q=Alice&status=unknown&risk=High&page=99')
    await expect(page).toHaveURL(/\/requests\?q=Alice&risk=High$/)
    await expect(page.getByText('第 1 / 1 页')).toBeVisible()

    await page.getByLabel('搜索申请人或资源').fill('不存在的资源')
    await page.getByRole('button', { name: '搜索' }).click()
    await expect(
      page.getByRole('heading', { name: '没有匹配结果' }),
    ).toBeVisible()
    await expect(page.getByText('当前查询没有匹配结果。')).toBeVisible()

    await page.getByLabel('当前演示员工').selectOption('user-dana')
    await page.getByLabel('搜索申请人或资源').fill('不存在的资源')
    await page.getByRole('button', { name: '搜索' }).click()
    await expect(
      page.getByRole('heading', { name: '暂无可见申请' }),
    ).toBeVisible()
    await expect(
      page.getByText('当前员工还没有可见的权限申请。'),
    ).toBeVisible()
  })

  test('过期 Pending 申请禁止批准但允许填写原因拒绝', async ({ page }) => {
    await resetDemoDataThroughUi(page)
    await page.getByLabel('搜索申请人或资源').fill('内部知识库')
    await page.getByRole('button', { name: '搜索' }).click()
    await expect(page).toHaveURL(
      (url) => url.searchParams.get('q') === '内部知识库',
    )
    await expect(page.getByText('共 2 条申请')).toBeVisible()
    await page.getByLabel('申请状态').selectOption('Pending')
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get('q') === '内部知识库' &&
        url.searchParams.get('status') === 'Pending',
    )
    await expect(page.getByText(/共 \d+ 条申请/)).toBeVisible()
    await page.getByLabel('风险等级').selectOption('Low')
    await page
      .getByRole('link', { name: '查看 Carol Wang 的内部知识库申请' })
      .click()

    await expect(
      page.getByRole('button', { name: '批准申请' }),
    ).toBeDisabled()
    await expect(
      page.getByText('访问期限已到，不能批准；仍可拒绝。'),
    ).toBeVisible()
    await page.getByRole('button', { name: '拒绝申请' }).click()
    const dialog = page.getByRole('dialog', { name: '拒绝权限申请' })
    await dialog.getByLabel('拒绝原因').fill('   ')
    await dialog.getByRole('button', { name: '确认拒绝' }).click()
    await expect(dialog.getByLabel('拒绝原因')).toHaveAccessibleDescription(
      '请填写拒绝原因',
    )

    await dialog.getByLabel('拒绝原因').fill('访问期限已经结束')
    await dialog.getByRole('button', { name: '确认拒绝' }).click()
    await expect(page.getByText('已拒绝（Rejected）')).toBeVisible()
    await expect(page.getByText('审批结果：已拒绝')).toHaveCount(1)
    await expect(page.getByText('访问期限已经结束')).toBeVisible()
  })
})
