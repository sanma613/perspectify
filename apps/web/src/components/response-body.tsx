'use client'

import { useMemo } from 'react'
import { JsonViewer } from './json-viewer'

export function ResponseBody({ body }: { body: string }) {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(body)
    } catch {
      return null
    }
  }, [body])

  if (parsed) {
    return <JsonViewer data={parsed} defaultExpanded={2} />
  }

  return (
    <pre className="max-h-[200px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-400">
      {body}
    </pre>
  )
}
