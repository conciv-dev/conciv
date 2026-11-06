import {makeRpcClient} from '@conciv/contract'
import {makeExtRpcClient} from '@conciv/extension'
import {createResource, createSignal, For, Match, Show, Switch, type JSX} from 'solid-js'
import {createTimer} from '@solid-primitives/timer'
import type {Round} from '../shared/defs.js'
import type {XrayRouter} from '../server.js'

export function Rounds(props: RoundsProps): JSX.Element {
  const [picked, setPicked] = createSignal<number | null>(null)
  const [data, {refetch}] = createResource(
    () => ({apiBase: props.apiBase, session: props.session}),
    async (input) => {
      const session = input.session ?? (await makeRpcClient(input.apiBase).sessions.resolve({})).sessionId
      const client = makeExtRpcClient<XrayRouter>(input.apiBase, DESIGN_EXTENSION_NAME)
      const target = await client.xray.current({session})
      return target === null ? null : client.xray.rounds({id: target.id})
    },
  )
  createTimer(() => void refetch(), POLL_MS, setInterval)
  const round = (): Round | undefined => {
    const rounds = data.latest?.rounds ?? []
    const wanted = picked()
    return rounds.find((entry) => entry.round === wanted) ?? rounds.at(-1)
  }
  const image = (path: string): string => `${props.apiBase}/api/ext/${DESIGN_EXTENSION_NAME}/files/${path}`
  return (
    <Switch fallback={<p class={NOTE}>Loading</p>}>
      <Match when={data.error !== undefined}>
        <p class={NOTE}>The rounds did not load: {String(data.error)}</p>
      </Match>
      <Match when={data.latest === null}>
        <p class={NOTE}>No design is registered. Call design_get with the Figma link.</p>
      </Match>
      <Match when={data.latest}>
        {(latest) => (
          <div class="text-sm p-4 flex flex-col gap-3">
            <div class="flex flex-wrap gap-2 items-center">
              <span class="op-fade">{latest().target.ref}</span>
              <For each={latest().rounds}>
                {(entry) => (
                  <button
                    type="button"
                    class="px-2 py-0.5 border border-base rounded"
                    aria-pressed={round()?.round === entry.round}
                    onClick={() => setPicked(entry.round)}
                  >
                    {entry.round}
                  </button>
                )}
              </For>
            </div>
            <Show when={round()} fallback={<p class={NOTE}>No round yet. Call design_watch.</p>}>
              {(shown) => <RoundView round={shown()} id={latest().target.id} image={image} />}
            </Show>
          </div>
        )}
      </Match>
    </Switch>
  )
}

type RoundsProps = {apiBase: string; session: string | null}

const DESIGN_EXTENSION_NAME = 'design'

const POLL_MS = 2000

const NOTE = 'p-4 text-sm op-fade m-0'

function RoundView(props: {round: Round; id: string; image: (path: string) => string}): JSX.Element {
  const counts = (): string => {
    const {much, noticeably, slightly, pins, other} = props.round.counts
    return `${much} much · ${noticeably} noticeably · ${slightly} slightly · ${pins} pins · ${other} other`
  }
  const coverage = (): string => {
    const {nodes, mapped, rendered, missing, dupes} = props.round.coverage
    return `${rendered} of ${nodes} nodes rendered · ${mapped} mapped · ${missing.length} missing · ${dupes.length} twice`
  }
  return (
    <div class="flex flex-col gap-3">
      <p class="m-0 tabular-nums">{counts()}</p>
      <p class="m-0 op-fade tabular-nums">{coverage()}</p>
      <Show when={props.round.pixels}>{(pixels) => <p class="m-0 op-fade">pixels {pixels().share}</p>}</Show>
      <table class="text-xs w-full">
        <tbody>
          <For each={props.round.rows}>
            {(row) => (
              <tr class="border-b border-base">
                <td class="font-mono py-1 pe-2">{row.node}</td>
                <td class="py-1 pe-2">{row.magnitude}</td>
                <td class="py-1">{row.text}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <For each={props.round.reflow}>
        {(reflow) => (
          <p class="text-xs m-0">
            {reflow.width}: {reflow.sticksOut.length} stick out ·{' '}
            {reflow.overflowX ? 'scrolls sideways' : 'no sideways scroll'} · {reflow.overlaps.length} overlaps ·{' '}
            {reflow.tags.filter((tag) => tag.ok === false).length} of {reflow.tags.length} tags fail
          </p>
        )}
      </For>
      <div class="flex flex-col gap-2">
        <img
          alt="live page"
          class="border border-base w-full"
          src={props.image(`live/${props.id}/${props.round.round}`)}
        />
        <img
          alt="pixel difference"
          class="border border-base w-full"
          src={props.image(`diff/${props.id}/${props.round.round}`)}
        />
        <img alt="design" class="border border-base w-full" src={props.image(`target/${props.id}`)} />
      </div>
    </div>
  )
}
