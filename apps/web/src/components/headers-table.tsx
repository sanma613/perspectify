export function HeadersTable({ headers }: { headers: Record<string, string> | null }) {
  return (
    <div className="rounded-lg bg-zinc-950 p-3 font-mono text-xs">
      {Object.entries(headers ?? {}).map(([key, value]) => (
        <div key={key} className="flex gap-3 py-0.5">
          <span className="min-w-[140px] shrink-0 text-zinc-500">{key}:</span>
          <span className="break-all text-zinc-300">{value}</span>
        </div>
      ))}
    </div>
  )
}
