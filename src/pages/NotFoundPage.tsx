import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

export function NotFoundPage(): ReactElement {
  return (
    <section aria-labelledby="not-found-title">
      <h1 className="text-3xl font-semibold" id="not-found-title">
        页面未找到
      </h1>
      <p className="mt-3 text-slate-600">当前地址不存在或已失效。</p>
      <Link
        className="mt-6 inline-flex font-medium text-blue-700 underline"
        to="/requests"
      >
        返回申请列表
      </Link>
    </section>
  )
}
