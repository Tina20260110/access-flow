import { expect, test } from '@playwright/test'

import { resetDemoDataThroughUi } from './support/demo-ui'

function localToday(): string {
  const date = new Date()
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

test.describe('AccessFlow 无障碍验收', () => {
  test('表单、风险状态和拒绝对话框支持键盘与辅助技术', async ({ page }) => {
    test.setTimeout(60_000)
    await resetDemoDataThroughUi(page)

    const createLink = page.getByRole('link', { name: '创建申请' })
    await createLink.focus()
    const outlineWidth = await createLink.evaluate(
      (element) => getComputedStyle(element).outlineWidth,
    )
    expect(outlineWidth).not.toBe('0px')
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('heading', { name: '创建权限申请' }),
    ).toBeVisible()

    const submit = page.getByRole('button', { name: '提交权限申请' })
    await submit.focus()
    await page.keyboard.press('Enter')
    const resourceField = page.getByLabel('目标资源')
    await expect(resourceField).toBeFocused()
    await expect(resourceField).toHaveAttribute('aria-invalid', 'true')
    await expect(resourceField).toHaveAccessibleDescription('请选择目标资源')
    await expect(page.getByLabel('申请原因')).toHaveAccessibleDescription(
      '请填写申请原因',
    )

    await resourceField.selectOption('resource-deployment')
    await page
      .getByLabel('请求的权限级别')
      .selectOption('permission-manage')
    await page.getByLabel('访问截止日期').fill(localToday())
    await page.getByLabel('申请原因').fill('   ')
    await submit.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('访问截止日期')).toHaveAccessibleDescription(
      '访问截止日期必须晚于提交日',
    )
    await expect(page.getByLabel('申请原因')).toHaveAccessibleDescription(
      '请填写申请原因',
    )

    const listLink = page.getByRole('link', { name: '申请列表' })
    await listLink.focus()
    await page.keyboard.press('Enter')
    await page.getByLabel('当前演示员工').selectOption('user-bob')
    await page.getByLabel('搜索申请人或资源').fill('数据分析平台')
    await page.getByRole('button', { name: '搜索' }).focus()
    await page.keyboard.press('Enter')
    await page.getByLabel('申请状态').selectOption('Pending')
    await page.getByLabel('风险等级').selectOption('High')

    const pendingRequest = page.getByRole('link', {
      name: '查看 Alice Chen 的数据分析平台申请',
    })
    await expect(pendingRequest).toBeVisible()
    await pendingRequest.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('待审批（Pending）')).toBeVisible()
    await expect(page.getByText('高风险（High）')).toBeVisible()
    await expect(page.getByText('⚠')).toHaveAttribute('aria-hidden', 'true')
    await expect(page.getByLabel('当前下一步')).toContainText(
      '负责审批员工核对申请并作出决定',
    )

    const rejectTrigger = page.getByRole('button', { name: '拒绝申请' })
    await rejectTrigger.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: '拒绝权限申请' })
    const rejectionReason = dialog.getByLabel('拒绝原因')
    await expect(rejectionReason).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(
      dialog.getByRole('button', { name: '确认拒绝' }),
    ).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(rejectionReason).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(rejectTrigger).toBeFocused()

    await page.keyboard.press('Enter')
    await rejectionReason.fill('   ')
    await dialog.getByRole('button', { name: '确认拒绝' }).focus()
    await page.keyboard.press('Enter')
    await expect(rejectionReason).toBeFocused()
    await expect(rejectionReason).toHaveAttribute('aria-invalid', 'true')
    await expect(rejectionReason).toHaveAccessibleDescription(
      '请填写拒绝原因',
    )

    await rejectionReason.fill('当前权限范围超出最小必要范围')
    await dialog.getByRole('button', { name: '确认拒绝' }).focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()
    await expect(
      page.getByRole('status').filter({ hasText: '申请已拒绝。' }),
    ).toBeVisible()
    await expect(page.getByText('已拒绝（Rejected）')).toBeVisible()
    await expect(page.getByText('审批结果：已拒绝')).toBeVisible()
    await expect(page.getByLabel('当前下一步')).toContainText(
      '审批已完成，无需进一步处理',
    )
  })
})
