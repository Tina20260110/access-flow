import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AccessFlowProviders } from '../../app/providers'
import { createAccessFlowQueryClient } from '../../app/query-client'
import { AccessFlowRoutes } from '../../app/router'
import type { AccessFlowGateway } from '../../data/access-flow-gateway'
import { DemoPreferencesAdapter } from '../../data/demo-preferences'
import { createScaleFixtureState } from '../../test/fixtures'
import { gatewayContractRuntime } from '../../test/gateway-contract'
import { MemoryAccessFlowGateway } from '../../test/memory-gateway'
import { DemoIdentityProvider } from '../demo-identity/DemoIdentityProvider'

class TestPreferenceStorage {
  readonly #values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value)
  }
}

type TestRootProps = PropsWithChildren<{
  gateway: AccessFlowGateway
  initialEntry: string
}>

function TestRoot({ children, gateway, initialEntry }: TestRootProps) {
  return (
    <AccessFlowProviders
      gateway={gateway}
      queryClient={createAccessFlowQueryClient()}
    >
      <DemoIdentityProvider
        preferences={new DemoPreferencesAdapter(new TestPreferenceStorage())}
      >
        <MemoryRouter initialEntries={[initialEntry]}>
          {children}
        </MemoryRouter>
      </DemoIdentityProvider>
    </AccessFlowProviders>
  )
}

function renderScaleList(gateway: AccessFlowGateway, initialEntry: string) {
  return render(
    <TestRoot gateway={gateway} initialEntry={initialEntry}>
      <AccessFlowRoutes />
    </TestRoot>,
  )
}

function requestLinks() {
  const table = screen.getByRole('table', { name: '权限申请列表' })
  return within(table).getAllByRole('link')
}

describe('申请列表代表性规模正确性', () => {
  it('在 1,000 条可见申请下保持搜索、组合筛选、稳定排序和分页正确', async () => {
    const user = userEvent.setup()
    const gateway = new MemoryAccessFlowGateway({
      initialState: createScaleFixtureState(),
      runtime: gatewayContractRuntime,
    })
    const firstPage = renderScaleList(gateway, '/requests')

    expect(await screen.findByText('共 1000 条申请')).toBeInTheDocument()
    expect(requestLinks().map((link) => link.getAttribute('href'))).toEqual(
      Array.from(
        { length: 10 },
        (_, index) =>
          `/requests/request-scale-${String(index).padStart(4, '0')}`,
      ),
    )

    await user.type(screen.getByLabelText('搜索申请人或资源'), 'bob')
    await user.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByText('共 500 条申请')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('搜索申请人或资源'))
    await user.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByText('共 1000 条申请')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('申请状态'), 'Approved')
    await user.selectOptions(screen.getByLabelText('风险等级'), 'High')
    expect(await screen.findByText('共 111 条申请')).toBeInTheDocument()
    expect(requestLinks()).toHaveLength(10)

    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(await screen.findByText('第 2 / 12 页')).toBeInTheDocument()

    firstPage.unmount()
    renderScaleList(gateway, '/requests?page=100')
    expect(await screen.findByText('第 100 / 100 页')).toBeInTheDocument()
    expect(requestLinks().map((link) => link.getAttribute('href'))).toEqual(
      Array.from(
        { length: 10 },
        (_, index) =>
          `/requests/request-scale-${String(index + 990).padStart(4, '0')}`,
      ),
    )
  })
})
