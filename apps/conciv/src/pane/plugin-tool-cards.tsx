import {children, createMemo, Show, untrack, type Accessor, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {createStore} from 'solid-js/store'
import {partition, uniqBy} from 'es-toolkit'
import {z} from 'zod'
import {MetaToolCard, parseInput, parseResultPayload, resultText, toolStatus} from '@conciv/ui-kit-chat/tools'
import type {ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import type {ToolCardEntry, ToolCardProps, ToolUIComponent} from '@conciv/protocol/tool-view-types'
import type {MountedSession} from '@conciv/plugin/experimental'
import {ToolCall, type ToolCallProps} from '@conciv/plugin/experimental/builtin'
import {builtins} from '../runtime/plugin/builtins'
import {usePluginHost, type Item} from '../runtime/plugin/host'
import {Contribution} from '../runtime/plugin/render'
import {toolFallbackCard} from './tool-fallback-card.js'

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

type BodyClaim = Extract<ToolCall, {render: unknown}>

type CardClaim = Extract<ToolCall, {card: unknown}>

type Claim<Value> = {tool: string; item: Item<Value>}

function drawsCard(claim: Claim<ToolCall>): claim is Claim<CardClaim> {
  return 'card' in claim.item.value
}

function drawsBody(claim: Claim<ToolCall>): claim is Claim<BodyClaim> {
  return 'render' in claim.item.value
}

function genericCard(card: ToolCardProps): ToolUIComponent {
  return card.ctx.catalog.meta(card.part.name) ? MetaToolCard : toolFallbackCard.render
}

export function createPluginToolCards(session: Accessor<MountedSession | undefined>): Accessor<ToolCardEntry[]> {
  const host = usePluginHost()
  const [declined, setDeclined] = createStore<Record<string, true>>({})

  const claims = createMemo(() => {
    const [builtinItems, userItems] = partition(host.items(ToolCall), (item) =>
      builtins.some((definition) => definition.id === item.plugin),
    )

    return uniqBy(
      [...userItems, ...builtinItems].flatMap((item) => item.value.tools.map((tool) => ({tool, item}))),
      (claim) => claim.tool,
    )
  })
  const bodyClaims = createMemo(() => claims().filter(drawsBody))
  const cardClaims = createMemo(() => claims().filter(drawsCard))
  const claimant = (tool: string) => bodyClaims().find((claim) => claim.tool === tool)?.item

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
            {(item) => {
              const body = children(() => (
                <Contribution plugin={item.plugin} failed={() => decline(id)}>
                  {() => {
                    const drawn = item.value.render(callProps(card, view))

                    if (drawn === undefined || drawn === null) queueMicrotask(() => decline(id))

                    return drawn
                  }}
                </Contribution>
              ))

              return <Dynamic component={genericCard(card)} {...card} body={body()} />
            }}
          </Show>
        )}
      </Show>
    )
  }

  const cardEntry = (claim: Claim<CardClaim>): ToolCardEntry => ({
    names: [claim.tool],
    render: (card) => {
      const id = untrack(() => card.part.id)

      return (
        <Contribution plugin={claim.item.plugin} failed={() => decline(id)}>
          {() => <Dynamic component={claim.item.value.card.render} {...card} />}
        </Contribution>
      )
    },
    hasEmbeddedBody: claim.item.value.card.hasEmbeddedBody,
    streamTitle: claim.item.value.streamTitle,
    display: claim.item.value.display,
    accepts: (part) => declined[part.id] !== true,
  })

  return createMemo((): ToolCardEntry[] => {
    const names = bodyClaims().map((claim) => claim.tool)
    const cards = cardClaims().map(cardEntry)

    return names.length === 0
      ? cards
      : [...cards, {names, render: PluginToolCard, hasEmbeddedBody: () => true, accepts}]
  })
}
