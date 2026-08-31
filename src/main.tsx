import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('未找到应用挂载节点')
}

createRoot(rootElement).render(
  <StrictMode>
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">AccessFlow</h1>
        <p className="mt-3 text-slate-600">工程基础设施已就绪。</p>
      </div>
    </main>
  </StrictMode>,
)
