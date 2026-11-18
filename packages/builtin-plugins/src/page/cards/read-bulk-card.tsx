import {Match, Show, Switch, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolProps} from '@conciv/plugin/experimental'
import {JsonTree} from '@conciv/ui-kit-chat/tools'
import {A11yNodeList, PageHtmlBlock, PageValueChip, type A11yNode} from './page-result-views.js'
import {pageOperation} from './page-tool-names.js'
import {ELEMENT_TARGET_KEYS, PageTool, QUIET_TEXT_CLASS, countLabel, elementTarget, outputPayload} from './shared.js'

const HtmlPayload = pageOperation('dom').output

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

const MatchesPayload = pageOperation('query').output

function matchLabel(count: number): string {
  return countLabel(count, 'match', 'matches')
}

function readHtml(payload: unknown): string | undefined {
  const parsed = HtmlPayload.safeParse(payload)
  return parsed.success ? parsed.data.html : undefined
}

function readNodes(payload: unknown): readonly A11yNode[] | undefined {
  const parsed = NodesPayload.safeParse(payload)
  return parsed.success ? parsed.data.nodes : undefined
}

function readMatches(payload: unknown): {count: number; elements: readonly unknown[]} | undefined {
  const parsed = MatchesPayload.safeParse(payload)
  return parsed.success ? parsed.data : undefined
}

export function ReadBulkCard(props: ToolProps): JSX.Element {
  const payload = () => outputPayload(props.output)
  const markup = () => readHtml(payload())
  const nodes = () => readNodes(payload())
  const matches = () => readMatches(payload())
  return (
    <PageTool
      {...props}
      subtitle={elementTarget(props.input)}
      skip={ELEMENT_TARGET_KEYS}
      hasContent={payload() !== undefined}
    >
      <div class="flex flex-col gap-1.5">
        <Switch>
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
    </PageTool>
  )
}
