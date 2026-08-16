import type {ReactNode} from 'react'
import {cn} from '@/lib/utils'

export function BrowserFrame({url, className, children}: {url: string; className?: string; children: ReactNode}) {
  return (
    <div className={cn('overflow-hidden bg-card text-card-foreground', className)}>
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span aria-hidden className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-border" />
          <span className="size-3 rounded-full bg-border" />
          <span className="size-3 rounded-full bg-border" />
        </span>
        <span className="od-mono mx-4 flex h-6 max-w-md flex-1 items-center justify-center rounded-md bg-muted text-[13px] text-muted-foreground">
          {url}
        </span>
        <span aria-hidden className="size-4" />
      </div>
      {children}
    </div>
  )
}
