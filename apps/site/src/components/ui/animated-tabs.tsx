import {m, useReducedMotion} from 'motion/react'
import {Tabs as TabsPrimitive} from 'radix-ui'
import {useId, type ReactNode} from 'react'
import {cn} from '@/lib/utils'

export type AnimatedTab = {id: string; label: string; icon?: ReactNode; badge?: ReactNode; disabled?: boolean}

type Variant = 'underline' | 'pill' | 'segment'

const INDICATOR_TRANSITION = {duration: 0.2, ease: [0.23, 1, 0.32, 1]} as const

const LIST_STYLES: Record<Variant, string> = {
  underline: 'gap-1 border-b border-border',
  pill: 'gap-1 rounded-full bg-muted p-1',
  segment: 'gap-0 rounded-lg bg-muted p-1',
}

const TAB_STYLES: Record<Variant, string> = {
  underline: 'rounded-t-md',
  pill: 'rounded-full',
  segment: 'flex-1 rounded-md',
}

const INDICATOR_STYLES: Record<Variant, string> = {
  underline: 'right-0 -bottom-px left-0 h-0.5 bg-primary',
  pill: 'inset-0 rounded-full border border-border bg-background shadow-sm',
  segment: 'inset-0 rounded-md border border-border bg-background shadow-sm',
}

function TabIndicator({variant, layoutId}: {variant: Variant; layoutId: string}) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <m.span
      className={cn('absolute', INDICATOR_STYLES[variant])}
      layout
      layoutId={layoutId}
      transition={shouldReduceMotion ? {duration: 0} : INDICATOR_TRANSITION}
    />
  )
}

function TabSlot({children}: {children?: ReactNode}) {
  if (!children) return null
  return <span className="relative z-10 inline-flex">{children}</span>
}

export function AnimatedTabs({
  tabs,
  value,
  onValueChange,
  variant = 'underline',
  label,
  className,
  listClassName,
  children,
}: {
  tabs: AnimatedTab[]
  value: string
  onValueChange: (value: string) => void
  variant?: Variant
  label: string
  className?: string
  listClassName?: string
  children?: ReactNode
}) {
  const layoutId = useId()

  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange} className={className}>
      <TabsPrimitive.List
        aria-label={label}
        className={cn('relative inline-flex w-fit max-w-full overflow-x-auto', LIST_STYLES[variant], listClassName)}
      >
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.id}
            value={tab.id}
            disabled={tab.disabled}
            className={cn(
              'group relative z-10 flex cursor-pointer items-center justify-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              'text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
              'data-[state=active]:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-muted-foreground',
              TAB_STYLES[variant],
            )}
          >
            {value === tab.id && <TabIndicator variant={variant} layoutId={layoutId} />}
            <TabSlot>{tab.icon}</TabSlot>
            <span className="relative z-10">{tab.label}</span>
            <TabSlot>{tab.badge}</TabSlot>
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  )
}
