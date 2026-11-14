import {createMemo, Show, untrack, type Accessor, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {uniqBy} from 'es-toolkit'
import {z} from 'zod'
import Wrench from 'lucide-solid/icons/wrench'
import {
  CardShell,
  cardHeader,
  MUTATING_BADGE,
  parseInput,
  parseResultPayload,
  resultText,
  ToolCard,
  toolStatus,
} from '@conciv/ui-kit-chat/tools'
import type {ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import type {MountedSession} from '@conciv/plugin/experimental'
import {ToolCall, type ToolCallProps} from '@conciv/plugin/experimental/builtin'
import {usePluginHost} from '../runtime/plugin/host'
import {Contribution} from '../runtime/plugin/render'

const JsonValue = z.json()

function finished(part: ToolCallPart, result: ToolResultPart | undefined): boolean {
  const status = toolStatus(part, result)

  return result !== undefined && status !== 'running' && status !== 'approval'
}

function callResult(part: ToolCallPart, result: ToolResultPart | undefined): ToolCallProps['result'] {
  if (toolStatus(part, result) !== 'complete') return {status: 'error', error: resultText(result)}
  const output = JsonValue.safeParse(parseResultPayload(result))

  return {status: 'success', output: output.success ? output.data : resultText(result)}
}

function WrenchIcon(): JSX.Element {
  return <Wrench size={14} />
}

function PluginCardShell(props: ToolCardProps & {children: JSX.Element}): JSX.Element {
  const {meta, title} = cardHeader(props)

  return (
    <Show
      when={meta()}
      fallback={
        <ToolCard Icon={WrenchIcon} title={`Tool: ${props.part.name}`} part={props.part} result={props.result}>
          {props.children}
        </ToolCard>
      }
    >
      {(declared) => (
        <CardShell
          meta={declared()}
          title={title()}
          metaBadge={declared().mutating ? MUTATING_BADGE : undefined}
          part={props.part}
          result={props.result}
          durationMs={props.durationMs}
        >
          {props.children}
        </CardShell>
      )}
    </Show>
  )
}

export function createPluginToolCards(session: Accessor<MountedSession | undefined>): Accessor<ToolCardEntry[]> {
  const host = usePluginHost()
  const [declined, setDeclined] = createStore<Record<string, true>>({})

  const claims = createMemo(() =>
    uniqBy(
      host.items(ToolCall).flatMap((item) => item.value.tools.map((tool) => ({tool, item}))),
      (claim) => claim.tool,
    ),
  )
  const claimant = (tool: string) => claims().find((claim) => claim.tool === tool)?.item

  const decline = (id: string) => setDeclined(id, true)

  const accepts = (part: ToolCallPart, result: ToolResultPart | undefined) =>
    finished(part, result) && session() !== undefined && declined[part.id] !== true

  const callProps = (card: ToolCardProps, view: MountedSession): ToolCallProps => ({
    get tool() {
      return card.part.name
    },
    get id() {
      return card.part.id
    },
    get input() {
      return parseInput(JsonValue, card.part) ?? card.part.arguments
    },
    get result() {
      return callResult(card.part, card.result)
    },
    get session() {
      return session() ?? view
    },
  })

  function PluginToolCard(card: ToolCardProps): JSX.Element {
    const id = untrack(() => card.part.id)

    return (
      <Show when={untrack(session)} keyed>
        {(view) => (
          <Show when={claimant(card.part.name)} keyed>
            {(item) => (
              <PluginCardShell {...card}>
                <Contribution plugin={item.plugin} failed={() => decline(id)}>
                  {() => {
                    const drawn = item.value.render(callProps(card, view))

                    if (drawn === undefined || drawn === null) queueMicrotask(() => decline(id))

                    return drawn
                  }}
                </Contribution>
              </PluginCardShell>
            )}
          </Show>
        )}
      </Show>
    )
  }

  return createMemo((): ToolCardEntry[] => {
    const names = claims().map((claim) => claim.tool)

    return names.length === 0 ? [] : [{names, render: PluginToolCard, hasEmbeddedBody: () => true, accepts}]
  })
}
