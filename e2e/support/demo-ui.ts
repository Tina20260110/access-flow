import { expect, type Page } from '@playwright/test'

export async function resetDemoDataThroughUi(page: Page): Promise<void> {
  await page.goto('/requests')
  await expect(
    page.getByRole('heading', { name: '申请列表' }),
  ).toBeVisible()

  const resetTrigger = page.getByRole('button', { name: '重置 Demo 数据' })
  await resetTrigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: '确认重置 Demo 数据？' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '取消' })).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')

  await expect(dialog).toBeHidden()
  await expect(page.getByLabel('当前演示员工')).toHaveValue('user-alice')
  await expect(page.getByText('Demo 数据已恢复为初始状态。')).toBeAttached()
}
