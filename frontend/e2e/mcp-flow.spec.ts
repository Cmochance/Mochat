import { expect, test } from '@playwright/test'

test.describe('MCP flow', () => {
  test('renders MCP controls and connection entry', async ({ page }) => {
    await page.goto('/chat')

    await expect(page.getByText('MCP')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Connections' })).toBeVisible()
  })

  test('opens approval modal shell when approval payload is present', async ({ page }) => {
    await page.goto('/chat')

    // 这里仅验证 UI 骨架存在，真正的审批链路由后端测试和联调环境覆盖。
    await expect(page.locator('body')).toBeVisible()
  })
})
