import {children, createMemo, Show, type JSX} from 'solid-js'
import Wrench from 'lucide-solid/icons/wrench'
import {
  CardChromeProvider,
  genericToolHeadline,
  ToolCard,
  ToolFallback,
  ToolFallbackPrimitive,
  toolFallbackHasEmbeddedBody,
  useCardChrome,
  useToolCallDuration,
} from '@conciv/ui-kit-chat/tools'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'

function ToolIcon(): JSX.Element {
  return <Wrench size={14} />
}

function ToolFallbackCard(props: ToolCardProps): JSX.Element {
  const body = children(() => props.body)
  const chrome = useCardChrome()
  const duration = useToolCallDuration()
  const headline = createMemo(() => genericToolHeadline(props.part))
  const subtitle = () => (chrome() === 'embedded' ? undefined : headline().subtitle)
  const meta = () => headline().args.join(' ') || undefined
  return (
    <CardChromeProvider value={chrome()} duration={duration}>
      <ToolCard
        Icon={ToolIcon}
        title={headline().title}
        subtitle={subtitle()}
        meta={meta()}
        part={props.part}
        result={props.result}
      >
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
          <div class="flex flex-col gap-2">{body()}</div>
        </Show>
      </ToolCard>
    </CardChromeProvider>
  )
}

export const toolFallbackCard: ToolCardView = {
  render: ToolFallbackCard,
  hasEmbeddedBody: toolFallbackHasEmbeddedBody,
}
