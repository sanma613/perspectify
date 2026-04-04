import type { InputHTMLAttributes } from 'react'

export function Field({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string | null
}) {
  return (
    <label className="block space-y-2 text-base">
      <span className="text-sm font-normal text-[#a1a1aa]">{label}</span>
      <input
        {...props}
        className="h-11 w-full rounded-lg border border-white/10 bg-[#1a1a1a] px-3 text-base text-white outline-none transition-colors duration-200 ease-in-out placeholder:text-[#52525b] hover:bg-[#202020] focus-visible:ring-2 focus-visible:ring-green-500"
      />
      {error ? <span className="text-xs text-[#ef4444]">{error}</span> : null}
    </label>
  )
}

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="h-11 w-full rounded-lg bg-[#22c55e] px-4 font-display text-sm font-bold text-[#031108] transition-colors duration-200 ease-in-out hover:bg-green-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  )
}
