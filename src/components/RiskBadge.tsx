import type { ReactElement } from 'react'

import type { RiskLevel } from '../domain/models'

const RISK_LABELS: Readonly<Record<RiskLevel, string>> = {
  Low: '低风险（Low）',
  Medium: '中风险（Medium）',
  High: '高风险（High）',
}

const RISK_STYLES: Readonly<Record<RiskLevel, string>> = {
  Low: 'border-slate-300 bg-slate-100 text-slate-700',
  Medium: 'border-amber-400 bg-amber-50 text-amber-900',
  High: 'border-2 border-red-600 bg-red-50 font-semibold text-red-900',
}

type RiskBadgeProps = Readonly<{
  riskLevel: RiskLevel
}>

export function RiskBadge({ riskLevel }: RiskBadgeProps): ReactElement {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm ${RISK_STYLES[riskLevel]}`}
    >
      {riskLevel === 'High' ? <span aria-hidden="true">⚠</span> : null}
      <span>{RISK_LABELS[riskLevel]}</span>
    </span>
  )
}
