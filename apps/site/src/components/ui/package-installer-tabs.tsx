import {Tabs as TabsPrimitive} from 'radix-ui'
import type {ReactNode} from 'react'
import {AnimatedTabs} from '@/components/ui/animated-tabs'
import {CopyButton} from '@/components/ui/copy-button'
import {cn} from '@/lib/utils'

export type PackageCommand = {id: string; label: string; icon: string; command: string}

export function PackageInstallerTabs({
  commands,
  value,
  onValueChange,
  className,
  listClassName,
  children,
}: {
  commands: PackageCommand[]
  value: string
  onValueChange: (value: string) => void
  className?: string
  listClassName?: string
  children?: ReactNode
}) {
  return (
    <AnimatedTabs
      label="Package manager"
      value={value}
      onValueChange={onValueChange}
      className={className}
      listClassName={cn('h-8', listClassName)}
      tabs={commands.map((command) => ({
        id: command.id,
        label: command.label,
        icon: (
          <img
            src={command.icon}
            alt=""
            width={14}
            height={14}
            className="size-4 opacity-60 grayscale transition-[filter,opacity] group-data-[state=active]:opacity-100 group-data-[state=active]:grayscale-0"
          />
        ),
      }))}
    >
      <TabsPrimitive.Content
        value={value}
        className="max-w-full rounded-lg focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      >
        {children}
      </TabsPrimitive.Content>
    </AnimatedTabs>
  )
}

export function PackageInstallerCommand({
  command,
  widestCommand = command,
  copyLabel = 'Copy install command',
  className,
  children,
}: {
  command: string
  widestCommand?: string
  copyLabel?: string
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <pre className="od-mono od-snippet relative flex h-9 items-center rounded-lg border bg-card px-4 text-[13px] leading-5">
        <span aria-hidden className="invisible flex items-center gap-2">
          <span>$</span>
          <span style={{width: `${widestCommand.length}ch`}} />
        </span>
        <span className="absolute inset-0 flex items-center gap-2 px-4">
          <span className="text-accent-text">$</span>
          {children ?? command}
        </span>
      </pre>
      <CopyButton text={command} label={copyLabel} />
    </div>
  )
}
