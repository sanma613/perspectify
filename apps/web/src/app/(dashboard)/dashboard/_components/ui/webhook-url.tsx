import { CopyButton } from './copy-button'

function maskWebhookUrl(value: string, tokenPrefix?: string) {
  const marker = '/webhook/'
  const markerIndex = value.indexOf(marker)

  if (markerIndex === -1) return value

  if (tokenPrefix) {
    return `${value.slice(0, markerIndex + marker.length)}${tokenPrefix}...`
  }

  const token = value.slice(markerIndex + marker.length)
  if (!token) return value

  const fallbackPrefix = token.slice(0, Math.min(8, token.length))
  return `${value.slice(0, markerIndex + marker.length)}${fallbackPrefix}...`
}

export function WebhookUrl({ url, note, tokenPrefix }: { url: string; note?: string; tokenPrefix?: string }) {
  const visibleUrl = maskWebhookUrl(url, tokenPrefix)

  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1a1a] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-sm text-[#ffffff]">{visibleUrl}</code>
        <CopyButton label="Copy" value={url} />
      </div>
      {note ? <p className="mt-2 text-xs text-[#a1a1aa]">{note}</p> : null}
    </div>
  )
}
