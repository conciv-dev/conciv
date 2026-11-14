import {children, Show, type JSX} from 'solid-js'
import Wrench from 'lucide-solid/icons/wrench'
import {ToolCard, ToolFallback, ToolFallbackPrimitive, toolFallbackHasEmbeddedBody} from '@conciv/ui-kit-chat/tools'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'

function ToolIcon(): JSX.Element {
  return <Wrench size={14} />
}

function ToolFallbackCard(props: ToolCardProps): JSX.Element {
  const body = children(() => props.body)
  return (
    <ToolCard Icon={ToolIcon} title={`Tool: ${props.part.name}`} part={props.part} result={props.result}>
      <Show
        when={body()}
        fallback={
          <ToolFallbackPrimitive.Root
            part={props.part}
            result={props.result}
            ctx={props.ctx}
            durationMs={props.durationMs}
          >
            <div class="flex flex-col gap-2">
              <ToolFallback.Error />
              <ToolFallback.Args />
              <ToolFallback.Approval />
              <ToolFallback.Result />
            </div>
          </ToolFallbackPrimitive.Root>
        }
      >
        {body()}
      </Show>
    </ToolCard>
  )
}

export const toolFallbackCard: ToolCardView = {
  render: ToolFallbackCard,
  hasEmbeddedBody: toolFallbackHasEmbeddedBody,
}
