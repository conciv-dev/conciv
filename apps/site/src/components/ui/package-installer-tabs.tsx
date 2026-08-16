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
}: {
  commands: PackageCommand[]
  value: string
  onValueChange: (value: string) => void
  className?: string
}) {
  return (
    <AnimatedTabs
      label="Package manager"
      value={value}
      onValueChange={onValueChange}
      className={className}
      listClassName="h-8"
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
    />
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
      <pre
        style={{minWidth: `calc(${widestCommand.length + 2}ch + 2rem)`}}
        className="od-mono od-snippet flex h-9 min-w-0 items-center gap-2 overflow-x-auto rounded-lg border bg-card px-4 text-[13px] leading-5"
      >
        <span className="text-primary">$</span>
        {children ?? command}
      </pre>
      <CopyButton text={command} label={copyLabel} />
    </div>
  )
}
