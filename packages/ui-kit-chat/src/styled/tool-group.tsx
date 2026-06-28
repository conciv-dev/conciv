import {Show, splitProps, type JSX} from 'solid-js'
import {ChevronDown, Loader} from 'lucide-solid'
import {Collapsible} from '@mandarax/ui-kit-system'

// assistant-ui's ToolGroup: a collapsible that folds N consecutive tool calls under one "N tool calls"
// trigger (chevron rotates via data-state; a shimmer plays while the group is still active). Neutral tokens.
export type ToolGroupProps = {
  count: number
  active?: boolean
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: JSX.Element
  class?: string
}

const ROOT =
  'w-full rounded-[var(--chat-radius-md)] [border:1px_solid_var(--chat-line)] [background:var(--chat-fill)] overflow-hidden'
const TRIGGER =
  'group w-full flex items-center gap-2 px-3 py-2 text-[0.75rem] [color:var(--chat-text-2)] cursor-pointer select-none [background:transparent] hover:[background:var(--chat-fill-strong)] focus-visible:[outline:0.125rem_solid_var(--chat-accent)] [outline-offset:-2px]'
const CHEVRON =
  'size-3 shrink-0 ml-auto [transition:transform_200ms_var(--chat-ease)] group-data-[state=closed]:-rotate-90 group-data-[state=open]:rotate-0'
const BODY = 'flex flex-col gap-2 px-3 pt-3 pb-2 [border-top:1px_solid_var(--chat-line)]'

export function ToolGroup(props: ToolGroupProps): JSX.Element {
  const [local] = splitProps(props, ['count', 'active', 'defaultOpen', 'open', 'onOpenChange', 'children', 'class'])
  const label = () => `${local.count} tool ${local.count === 1 ? 'call' : 'calls'}`
  return (
    <Collapsible.Root
      open={local.open}
      defaultOpen={local.defaultOpen}
      onOpenChange={(details) => local.onOpenChange?.(details.open)}
    >
      <div class={`${ROOT}  ${local.class ?? ''}`}>
        <Collapsible.Trigger class={TRIGGER}>
          <Show when={local.active}>
            <Loader size={0.75} class="shrink-0 [animation:spin_0.6s_linear_infinite]" />
          </Show>
          <span class="font-medium" classList={{'[animation:pw-think-shimmer_1.6s_linear_infinite]': local.active}}>
            {label()}
          </span>
          <ChevronDown size={0.75} class={CHEVRON} />
        </Collapsible.Trigger>
        <Collapsible.Content>
          <div class={BODY}>{local.children}</div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}
