import { describe, expect, it } from 'vitest'

import type { ListQueryState } from '../../domain/models'
import {
  isCanonicalListQuery,
  parseListQuery,
  serializeListQuery,
  setListQueryPage,
  setListQueryRiskLevel,
  setListQuerySearch,
  setListQueryStatus,
} from './list-query-state'

const defaultState: ListQueryState = {
  search: '',
  status: null,
  riskLevel: null,
  page: 1,
}

describe('parseListQuery', () => {
  it('缺失参数使用完整默认状态', () => {
    expect(parseListQuery(new URLSearchParams())).toEqual(defaultState)
  })

  it('解析并规范搜索、状态、风险和正整数页码', () => {
    const params = new URLSearchParams(
      'q=%20Alice%20&status=Pending&risk=High&page=2',
    )

    expect(parseListQuery(params)).toEqual({
      search: 'Alice',
      status: 'Pending',
      riskLevel: 'High',
      page: 2,
    })
  })

  it.each(['0', '-1', '1.5', 'NaN', '9007199254740992'])(
    '无效页码 %s 独立回退为第 1 页',
    (page) => {
      const params = new URLSearchParams({
        q: 'console',
        status: 'Approved',
        risk: 'Low',
        page,
      })

      expect(parseListQuery(params)).toEqual({
        search: 'console',
        status: 'Approved',
        riskLevel: 'Low',
        page: 1,
      })
    },
  )

  it('坏筛选参数不会清除其他合法参数', () => {
    expect(
      parseListQuery(
        new URLSearchParams('q=console&status=unknown&risk=High&page=3'),
      ),
    ).toEqual({
      search: 'console',
      status: null,
      riskLevel: 'High',
      page: 3,
    })
  })

  it('空白搜索视为未搜索，特殊字符作为普通文本', () => {
    expect(parseListQuery(new URLSearchParams({ q: '   ' })).search).toBe('')
    expect(
      parseListQuery(new URLSearchParams({ q: '<script>&项目' })).search,
    ).toBe('<script>&项目')
  })

  it('合法重复参数只采用第一个值', () => {
    expect(
      parseListQuery(
        new URLSearchParams(
          'q=first&q=second&status=Pending&status=Approved&risk=Low&risk=High&page=2&page=9',
        ),
      ),
    ).toEqual({
      search: 'first',
      status: 'Pending',
      riskLevel: 'Low',
      page: 2,
    })
  })

  it('第一个重复值无效时不采用后续合法值', () => {
    expect(
      parseListQuery(
        new URLSearchParams(
          'q=%20%20&q=Alice&status=unknown&status=Approved&risk=invalid&risk=High&page=0&page=2',
        ),
      ),
    ).toEqual(defaultState)
  })
})

describe('serializeListQuery', () => {
  it('省略默认值并保持稳定参数顺序', () => {
    expect(serializeListQuery(defaultState).toString()).toBe('')
    expect(
      serializeListQuery({
        search: 'Alice',
        status: 'Rejected',
        riskLevel: 'Medium',
        page: 3,
      }).toString(),
    ).toBe('q=Alice&status=Rejected&risk=Medium&page=3')
  })

  it('parse → canonical serialize 具有确定性并移除重复与未知参数', () => {
    const source = new URLSearchParams(
      'page=02&risk=High&status=Pending&q=%20Alice%20&q=Bob&unknown=value',
    )
    const canonical = serializeListQuery(parseListQuery(source))

    expect(canonical.toString()).toBe(
      'q=Alice&status=Pending&risk=High&page=2',
    )
    expect(serializeListQuery(parseListQuery(canonical)).toString()).toBe(
      canonical.toString(),
    )
    expect(isCanonicalListQuery(source)).toBe(false)
    expect(isCanonicalListQuery(canonical)).toBe(true)
  })

  it('第一个重复值无效时 canonical serialize 使用 fallback', () => {
    const source = new URLSearchParams(
      'status=invalid&status=Approved&risk=Low',
    )

    expect(serializeListQuery(parseListQuery(source)).toString()).toBe('risk=Low')
  })
})

describe('查询更新 helpers', () => {
  const state: ListQueryState = {
    search: 'Alice',
    status: 'Pending',
    riskLevel: 'High',
    page: 4,
  }

  it('搜索或筛选改变时重置 page', () => {
    expect(setListQuerySearch(state, ' Bob ')).toEqual({
      ...state,
      search: 'Bob',
      page: 1,
    })
    expect(setListQueryStatus(state, 'Approved')).toEqual({
      ...state,
      status: 'Approved',
      page: 1,
    })
    expect(setListQueryRiskLevel(state, null)).toEqual({
      ...state,
      riskLevel: null,
      page: 1,
    })
  })

  it('相同查询值不制造无意义 page 重置', () => {
    expect(setListQuerySearch(state, ' Alice ')).toEqual(state)
    expect(setListQueryStatus(state, 'Pending')).toEqual(state)
    expect(setListQueryRiskLevel(state, 'High')).toEqual(state)
  })

  it('仅翻页时保留全部查询条件', () => {
    expect(setListQueryPage(state, 2)).toEqual({ ...state, page: 2 })
    expect(setListQueryPage(state, 0)).toEqual({ ...state, page: 1 })
  })
})
