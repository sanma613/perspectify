import type { HTMLAttributes } from 'react'

export function Skeleton({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  const classes = `animate-pulse rounded bg-white/5 ${className}`.trim()
  return <div className={classes} {...props} />
}
