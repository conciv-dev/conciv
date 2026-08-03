import type {JSX} from 'solid-js'
import {Wrench} from 'lucide-solid'
import {ToolCard, ToolFallback, ToolFallbackPrimitive} from '@conciv/ui-kit-chat'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'

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
