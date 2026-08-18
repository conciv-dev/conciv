import {splitProps, type JSX} from 'solid-js'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import {Collapsible} from '@conciv/ui-kit-system'
import {FOCUS_INSET} from '../../styled/classes.js'

const TRIGGER = `group w-full flex items-center gap-1.5 py-1 text-start text-[length:var(--chat-text-sm)] text-chat-text-2 cursor-pointer select-none [background:transparent] [transition:color_120ms_var(--chat-ease)] hover:[color:var(--chat-text)] ${FOCUS_INSET}`
const CHEVRON =
  'shrink-0 text-chat-text-3 [transition:rotate_150ms_var(--chat-ease)] group-data-[state=closed]:-rotate-90 group-data-[state=open]:rotate-0'
const HEADER_SLOT = 'flex flex-1 gap-1.5 min-w-0 items-center'
const BODY = 'pl-4 pt-1 pb-1.5 text-[length:var(--chat-text-sm)] text-chat-text-2'

export function CollapsibleSection(props: {
  header: JSX.Element
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: JSX.Element
  class?: string
}): JSX.Element {
  const [local] = splitProps(props, ['header', 'defaultOpen', 'open', 'onOpenChange', 'children', 'class'])
  return (
    <Collapsible.Root
      defaultOpen={local.defaultOpen}
      open={local.open}
      onOpenChange={(details) => local.onOpenChange?.(details.open)}
      class={`min-w-0 w-full ${local.class ?? ''}`}
    >
      <Collapsible.Trigger class={TRIGGER}>
        <span class={HEADER_SLOT}>{local.header}</span>
        <ChevronDown size={14} class={CHEVRON} aria-hidden="true" />
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div class={BODY}>{local.children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
