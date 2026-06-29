import type {JSX} from 'solid-js'
import {Wrench} from 'lucide-solid'
import {ToolCard, ToolFallback, ToolFallbackPrimitive} from '@mandarax/ui-kit-chat'
import type {ToolCardProps} from '@mandarax/protocol/tool-view-types'

// The widget's look for an unknown tool: ui-kit-chat's bordered ToolCard chrome (same as the concrete
// cards, so the thread reads as one consistent set) wrapping the FAITHFUL ToolFallback body parts —
// the minimal text-trigger fallback stays in the library; the widget just dresses it in a card. Passed
// to <Thread components={{ToolFallback}}> so the dispatch falls back here for any name without a card.
function ToolIcon(): JSX.Element {
  return <Wrench size={14} />
}

export function ToolFallbackCard(props: ToolCardProps): JSX.Element {
  return (
    <ToolCard Icon={ToolIcon} title={`Tool: ${props.part.name}`} part={props.part} result={props.result}>
      <ToolFallbackPrimitive.Root part={props.part} result={props.result} ctx={props.ctx} durationMs={props.durationMs}>
        <div class="flex flex-col gap-2">
          <ToolFallback.Error />
          <ToolFallback.Args />
          <ToolFallback.Approval />
          <ToolFallback.Result />
        </div>
      </ToolFallbackPrimitive.Root>
    </ToolCard>
  )
}
