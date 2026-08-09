import {Match, Show, Switch, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {DANGER_TEXT_CLASS, JsonTree} from '@conciv/ui-kit-chat/tools'
import {A11yNodeList, PageHtmlBlock, PageValueChip, type A11yNode} from '../page-result-views.js'
import {
  CardShell,
  ChipRow,
  QUIET_TEXT_CLASS,
  cardErrorMessage,
  cardHeader,
  cardPayload,
  detailChips,
  elementTargetValue,
  toolInput,
} from './shared.js'

const HtmlPayload = z.looseObject({html: z.string()})

const NodesPayload = z.looseObject({
  nodes: z.array(
    z.looseObject({
      ref: z.string().optional(),
      role: z.string().optional(),
      name: z.string().optional(),
      value: z.string().optional(),
      state: z.array(z.string()).optional(),
    }),
  ),
})

const MatchesPayload = z.looseObject({count: z.number(), elements: z.array(z.unknown())})

const COUNT_FORMAT = new Intl.NumberFormat()
const COUNT_PLURAL = new Intl.PluralRules('en')

function matchLabel(count: number): string {
  return `${COUNT_FORMAT.format(count)} ${COUNT_PLURAL.select(count) === 'one' ? 'match' : 'matches'}`
}

function htmlOf(payload: unknown): string | undefined {
  const parsed = HtmlPayload.safeParse(payload)
  return parsed.success ? parsed.data.html : undefined
}

function nodesOf(payload: unknown): readonly A11yNode[] | undefined {
  const parsed = NodesPayload.safeParse(payload)
  return parsed.success ? parsed.data.nodes : undefined
}

function matchesOf(payload: unknown): {count: number; elements: readonly unknown[]} | undefined {
  const parsed = MatchesPayload.safeParse(payload)
  return parsed.success ? parsed.data : undefined
}

export function ReadBulkCard(props: ToolCardProps): JSX.Element {
  const {meta, title} = cardHeader(props)
  const input = () => toolInput(props.part)
  const element = () => elementTargetValue(input())
  const chips = () => detailChips(meta(), input())
  const payload = () => cardPayload(props.result)
  const markup = () => htmlOf(payload())
  const nodes = () => nodesOf(payload())
  const matches = () => matchesOf(payload())
  const errorMessage = () => cardErrorMessage(props.result)
  return (
    <CardShell meta={meta()} title={title()} part={props.part} result={props.result} durationMs={props.durationMs}>
      <div class="flex flex-col gap-1.5">
        <ChipRow element={element()} chips={chips()} />
        <Switch>
          <Match when={errorMessage()}>{(message) => <p class={DANGER_TEXT_CLASS}>{message()}</p>}</Match>
          <Match when={markup() !== undefined}>
            <Show when={markup()} fallback={<p class={QUIET_TEXT_CLASS}>the element has no markup</p>}>
              {(value) => <PageHtmlBlock markup={value()} />}
            </Show>
          </Match>
          <Match when={nodes()}>
            {(list) => (
              <Show
                when={list().length > 0}
                fallback={<p class={QUIET_TEXT_CLASS}>the snapshot found no accessible nodes</p>}
              >
                <A11yNodeList nodes={list()} />
              </Show>
            )}
          </Match>
          <Match when={matches()}>
            {(found) => (
              <>
                <p class="m-0">
                  <PageValueChip value={matchLabel(found().count)} />
                </p>
                <Show when={found().elements.length > 0}>
                  <JsonTree data={found().elements} />
                </Show>
              </>
            )}
          </Match>
          <Match when={payload() !== undefined}>
            <JsonTree data={payload()} />
          </Match>
        </Switch>
      </div>
    </CardShell>
  )
}
