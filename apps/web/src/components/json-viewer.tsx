'use client'

import type { ReactNode } from 'react'

export function JsonViewer({
  data,
  defaultExpanded = 1,
}: {
  data: unknown
  defaultExpanded?: number
}) {
  return (
    <div className="font-mono text-xs">
      <JsonNode value={data} depth={0} defaultExpanded={defaultExpanded} />
    </div>
  )
}

function JsonNode({
  value,
  depth,
  defaultExpanded,
  label,
}: {
  value: unknown
  depth: number
  defaultExpanded: number
  label?: string
}) {
  if (value === null || typeof value !== 'object') {
    return (
      <div className="whitespace-pre-wrap">
        {label ? <span className="text-emerald-300">{label}: </span> : null}
        <span className="text-cyan-200">{formatScalar(value)}</span>
      </div>
    )
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value)

  const summary = Array.isArray(value) ? `Array(${entries.length})` : `Object(${entries.length})`

  return (
    <details className="ml-2" open={depth < defaultExpanded}>
      <summary className="cursor-pointer select-none text-zinc-300">
        {label ? <span className="text-emerald-300">{label}: </span> : null}
        <span className="text-zinc-500">{summary}</span>
      </summary>
      <div className="mt-1 space-y-1">
        {entries.length === 0 ? (
          <div className="ml-4 text-zinc-500">Empty</div>
        ) : (
          entries.map(([childLabel, childValue]) => (
            <div className="ml-4" key={`${label ?? 'root'}-${childLabel}`}>
              <JsonNode
                value={childValue}
                label={childLabel}
                depth={depth + 1}
                defaultExpanded={defaultExpanded}
              />
            </div>
          ))
        )}
      </div>
    </details>
  )
}

function formatScalar(value: unknown): ReactNode {
  if (value === null) return 'null'
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return String(value)
}
