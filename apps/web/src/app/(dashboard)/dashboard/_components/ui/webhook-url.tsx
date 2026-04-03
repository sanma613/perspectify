import { CopyButton } from './copy-button'

function truncateUrl(value: string, maxLength = 64) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}...`
}

export function WebhookUrl({ url, note }: { url: string; note?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1a1a] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-sm text-[#ffffff]">{truncateUrl(url)}</code>
        <CopyButton label="Copy" value={url} />
      </div>
      {note ? <p className="mt-2 text-xs text-[#a1a1aa]">{note}</p> : null}
    </div>
  )
}
