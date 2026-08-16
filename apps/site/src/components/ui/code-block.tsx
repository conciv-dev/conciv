import type {ReactNode} from 'react'
import {CopyButton} from '@/components/ui/copy-button'
import {cn} from '@/lib/utils'

export function CodeBlock({
  filename,
  copyText,
  copyLabel,
  className,
  children,
}: {
  filename: string
  copyText: string
  copyLabel: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('overflow-hidden rounded-[10px] border bg-card', className)}>
      <div className="flex h-10 items-center justify-between border-b pr-2 pl-4">
        <span className="od-mono od-caption text-muted-foreground">{filename}</span>
        <CopyButton text={copyText} label={copyLabel} className="size-7 rounded-md" />
      </div>
      {children}
    </div>
  )
}
