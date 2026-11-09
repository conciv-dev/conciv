import {For, Show, type Component, type JSX} from 'solid-js'
import Camera from 'lucide-solid/icons/camera'
import Check from 'lucide-solid/icons/check'
import X from 'lucide-solid/icons/x'
import type {LucideProps} from 'lucide-solid'
import {Card} from './card.js'
import type {createXrayData} from './data.js'

export function Panel(props: {
  data: ReturnType<typeof createXrayData>
  close: () => void
  capture: () => Promise<boolean>
}): JSX.Element {
  const summary = () => props.data.summary()
  return (
    <section
      aria-label="Design x-ray"
      class="border border-chat-line bg-chat-glass flex flex-col gap-4 w-90 pointer-events-auto start-12 inset-y-0 fixed"
      data-conciv-key="ovRJEQ"
    >
      <header
        class="px-4 py-2.5 border-b border-chat-line-soft border-solid flex gap-2 items-center"
        data-conciv-key="56E44A"
      >
        <span class="text-sm text-chat-text-hi font-semibold shrink-0 whitespace-nowrap" data-conciv-key="8YCz8Q">
          Design x-ray
        </span>
        <span class="text-xs text-chat-text-hi grow min-w-0 truncate" data-conciv-key="UZ5gFg">
          {props.data.design.latest?.target.ref}
        </span>
        <HeaderButton label="Capture the page" icon={Camera} onClick={() => void props.capture()} />
        <HeaderButton label="Close" icon={X} onClick={props.close} />
      </header>
      <Show when={props.data.card()}>{(card) => <Card card={card()} data={props.data} />}</Show>
      <Show when={props.data.stack()}>
        <StackBody data={props.data} />
      </Show>
      <div
        class="px-6 flex flex-col gap-5"
        hidden={props.data.card() !== null || props.data.stack()}
        data-conciv-key="H800hA"
      >
        <Show when={summary()}>
          {(sum) => (
            <div class="flex flex-col gap-1 items-stretch" data-conciv-key="OR53IQ">
              <h2 class="text-xl text-chat-text-hi font-semibold m-0" data-conciv-key="zIz5eA">
                {sum().matching ? 'Matching the design' : 'Not matching yet'}
              </h2>
              <p class="text-[length:var(--chat-text-md)] text-chat-text-2 m-0" data-conciv-key="GvjYag">
                {sum().problems} problems on {sum().elements} elements. {sum().matched} of {sum().total} elements match
                the design.
              </p>
            </div>
          )}
        </Show>
        <div class="flex gap-2 items-center" data-conciv-key="e3kAnQ">
          <div class="flex gap-0.75 items-center" data-conciv-key="WC9zFg">
            <For each={props.data.history()}>
              {(entry) => (
                <span
                  title={`check ${entry.round} · ${entry.rows.length} problems`}
                  class={`rounded-sm h-1.5 w-3.5 ${entry.round === props.data.shownRound()?.round ? 'bg-chat-accent' : 'bg-chat-line'}`}
                  data-conciv-key="aeoTvw"
                />
              )}
            </For>
          </div>
          <span class="text-xs text-chat-text-2 grow" data-conciv-key="BVkMWA">
            Check {props.data.shownRound()?.round} of {props.data.rounds().at(-1)?.round} ·{' '}
            {ago(props.data.shownRound()?.at ?? Date.now())}
          </span>
          <button
            type="button"
            class="text-xs text-chat-text-3 p-0 border-0 bg-transparent"
            disabled={props.data.earlier() === null}
            onClick={() => props.data.pinRound(props.data.earlier()?.round ?? null)}
            data-conciv-key="AqJd5Q"
          >
            ‹ earlier
          </button>
        </div>
        <div class="flex flex-col gap-2" data-conciv-key="koIS0g">
          <span
            class="text-[length:var(--chat-text-xs)] text-chat-text-3 tracking-wide font-semibold"
            data-conciv-key="PuX5GQ"
          >
            VIEWPORT
          </span>
          <div
            class="p-0.5 rounded-chat-surface-md bg-chat-fill-soft flex gap-0.5 items-center"
            data-conciv-key="QBGEVw"
          >
            <For each={props.data.viewports()}>
              {(width) => (
                <button
                  type="button"
                  aria-pressed={width === props.data.viewport()}
                  class={`text-xs px-2 py-0.75 border rounded-chat-surface-sm flex shrink grow-0 basis-1/3 items-center justify-center ${width === props.data.viewport() ? 'bg-chat-panel border-chat-line-soft text-chat-text-hi font-semibold' : 'bg-transparent border-transparent text-chat-text-3'}`}
                  onClick={() => props.data.pickViewport(width)}
                  data-conciv-key="p1vejg"
                >
                  <span data-conciv-key="ZOXU_A">{viewportName(width)}</span>
                </button>
              )}
            </For>
          </div>
        </div>
        <div class="bg-chat-line-soft shrink-0 h-px" data-conciv-key="GkIjPA" />
        <div class="flex flex-col gap-3.5 h-71.5" data-conciv-key="FoJVLQ">
          <span
            class="text-[length:var(--chat-text-xs)] text-chat-text-3 tracking-wide font-semibold"
            data-conciv-key="FjWvOw"
          >
            PROBLEMS · {props.data.problems().length}
          </span>
          <div class="flex flex-col gap-3.5 min-h-0 overflow-y-auto" data-conciv-key="7zNIiA">
            <For each={props.data.problems()}>
              {(problem) => (
                <div class="flex flex-col gap-1 items-stretch" data-conciv-key="vBKgIg">
                  <div class="flex gap-2 items-center" data-conciv-key="QnDGfQ">
                    <svg
                      viewBox="0 0 8 8"
                      aria-hidden="true"
                      class="shrink-0 size-2"
                      style={{fill: `var(--chat-${TAGS[problem.magnitude]?.hue ?? 'dim'})`}}
                      data-conciv-key="OJP1Vw"
                    >
                      <circle cx="4" cy="4" r="4" data-conciv-key="TomoEw" />
                    </svg>
                    <span class="text-sm text-chat-text-hi font-semibold grow" data-conciv-key="VD8MhA">
                      {problem.name}
                    </span>
                    <span
                      class={`text-[length:var(--chat-text-xs)] font-semibold px-1.5 py-px rounded-chat-chip bg-chat-fill-soft flex items-center ${HUE_TEXT[TAGS[problem.magnitude]?.hue ?? 'dim']}`}
                      data-conciv-key="h6-uHQ"
                    >
                      <span data-conciv-key="OVHJHQ">{TAGS[problem.magnitude]?.label}</span>
                    </span>
                  </div>
                  <For each={problem.lines}>
                    {(line) => (
                      <p class="text-[length:var(--chat-text-md)] text-chat-text m-0 w-74" data-conciv-key="xpnnRQ">
                        {line}
                      </p>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </div>
        <div class="bg-chat-line-soft shrink-0 h-px" data-conciv-key="04XpPA" />
        <div class="flex flex-col gap-1.5 w-50 items-start" data-conciv-key="Qn54kQ">
          <span
            class="text-[length:var(--chat-text-xs)] text-chat-text-3 tracking-wide font-semibold"
            data-conciv-key="Nvp7FA"
          >
            SHOW ON THE PAGE
          </span>
          <For each={SHOWN_LAYERS}>
            {(entry) => (
              <label class="flex gap-2 items-center" data-conciv-key="ZKE1dw">
                <input
                  type="checkbox"
                  class="sr-only"
                  checked={props.data.shown(entry.layer)}
                  disabled={entry.layer === 'moved' && props.data.moved() === 0}
                  onChange={(event) => props.data.show(entry.layer, event.currentTarget.checked)}
                  data-conciv-key="3fvaMA"
                />
                <span
                  class={`border rounded-chat-surface-sm flex size-4 items-center justify-center ${props.data.shown(entry.layer) ? 'bg-chat-accent border-chat-accent text-chat-on-accent' : 'border-chat-line'}`}
                  data-conciv-key="8LAtVg"
                >
                  <Show when={props.data.shown(entry.layer)}>
                    <Check class="size-3 block" aria-hidden="true" />
                  </Show>
                </span>
                <span
                  class={`text-[length:var(--chat-text-md)] ${props.data.shown(entry.layer) ? 'text-chat-text' : 'text-chat-text-2'}`}
                  data-conciv-key="UQTc2A"
                >
                  {entry.label}
                </span>
              </label>
            )}
          </For>
        </div>
      </div>
    </section>
  )
}

const TAGS: Record<string, {label: string; hue: string}> = {
  much: {label: 'Wrong', hue: 'danger'},
  noticeably: {label: 'Looks different', hue: 'accent'},
  paint: {label: 'Looks different', hue: 'accent'},
  slightly: {label: 'Off a bit', hue: 'warn'},
  reflow: {label: 'Reflows', hue: 'agent'},
  pin: {label: 'Pinned', hue: 'dim'},
  other: {label: 'Check', hue: 'dim'},
}

const VIEWPORT_NAMES = [
  {from: 1280, name: 'Desktop'},
  {from: 768, name: 'Laptop'},
  {from: 0, name: 'Mobile'},
]

const SHOWN_LAYERS = [
  {layer: 'design', label: 'Outlines of the design'},
  {layer: 'page', label: 'Outlines of the page'},
  {layer: 'moved', label: 'What moved since the last check'},
] as const

const MINUTE_MS = 60_000

const AGO = new Intl.RelativeTimeFormat('en', {numeric: 'always', style: 'short'})

function viewportName(width: number): string {
  return `${VIEWPORT_NAMES.find((entry) => width >= entry.from)?.name ?? ''} ${width}`
}

function ago(at: number): string {
  return AGO.format(-Math.max(Math.round((Date.now() - at) / MINUTE_MS), 0), 'minute')
}

const HUE_TEXT: Record<string, string> = {
  danger: 'text-chat-danger',
  accent: 'text-chat-accent',
  warn: 'text-chat-warn',
  agent: 'text-chat-agent',
  dim: 'text-chat-dim',
}

function HeaderButton(props: {label: string; icon: Component<LucideProps>; onClick: () => void}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={props.label}
      class="text-chat-text-2 p-1.5 border-0 rounded-chat-surface-sm bg-transparent flex size-7 items-center"
      onClick={() => props.onClick()}
      data-conciv-key="ogyHWg"
    >
      <props.icon class="size-full block" aria-hidden="true" />
    </button>
  )
}

const PLANES = [
  {plane: 'src', label: 'SRC'},
  {plane: 'cssom', label: 'CSSOM'},
  {plane: 'dom', label: 'DOM'},
] as const

function StackBody(props: {data: ReturnType<typeof createXrayData>}): JSX.Element {
  const first = () => props.data.rounds()[0]?.round ?? 0
  const last = () => props.data.rounds().at(-1)?.round ?? 0
  const shown = () => props.data.shownRound()?.round ?? last()
  const fraction = () => (last() === first() ? 1 : (shown() - first()) / (last() - first()))
  return (
    <div class="px-6 flex flex-col gap-5" data-conciv-key="DuzQ6A">
      <div class="flex flex-col gap-1.5 items-stretch" data-conciv-key="GtxBag">
        <div class="flex gap-2 items-center" data-conciv-key="ZJTIiQ">
          <span class="text-xs text-chat-text-2 grow" data-conciv-key="dvPxEw">
            Round
          </span>
          <span class="text-xs text-chat-text-hi font-chat-mono" data-conciv-key="2Uh1Mg">
            {shown()} / {last()}
          </span>
        </div>
        <div class="h-3 relative" data-conciv-key="snH6Mw">
          <div
            class="rounded-[calc(var(--chat-space)*0.25)] bg-chat-line h-0.5 inset-x-0 top-1/2 absolute"
            data-conciv-key="yVZr5Q"
          />
          <div class="h-0.5 inset-x-0 top-1/2 absolute" data-conciv-key="MuAjOQ">
            <div
              class="rounded-[calc(var(--chat-space)*0.25)] bg-chat-accent h-full"
              style={{width: `${fraction() * 100}%`}}
              data-conciv-key="tvUdxA"
            />
          </div>
          <svg
            viewBox="0 0 12 12"
            aria-hidden="true"
            class="size-3 top-0 absolute"
            style={{left: `calc((100% - var(--chat-space) * 3) * ${fraction()})`}}
            data-conciv-key="SlOPPw"
          >
            <circle cx="6" cy="6" r="5.5" class="fill-chat-panel stroke-chat-accent" data-conciv-key="Y0sG0A" />
          </svg>
          <input
            type="range"
            aria-label="Round"
            class="m-0 opacity-0 size-full inset-0 absolute"
            min={first()}
            max={last()}
            step={1}
            value={shown()}
            onInput={(event) => props.data.pinRound(Number(event.currentTarget.value))}
            data-conciv-key="zthYHQ"
          />
        </div>
      </div>
      <div class="flex flex-col gap-2" data-conciv-key="usjwxA">
        <span
          class="text-[length:var(--chat-text-xs)] text-chat-text-3 tracking-wide font-semibold"
          data-conciv-key="-6pWaA"
        >
          PLANES
        </span>
        <div class="p-0.5 rounded-chat-surface-md bg-chat-fill-soft flex gap-0.5 items-center" data-conciv-key="x0BqaA">
          <For each={PLANES}>
            {(entry) => (
              <button
                type="button"
                aria-pressed={props.data.plane(entry.plane)}
                class={`text-xs px-2 py-0.75 border rounded-chat-surface-sm flex grow basis-0 items-center justify-center ${props.data.plane(entry.plane) ? 'bg-chat-panel border-chat-line-soft text-chat-text-hi font-semibold' : 'bg-transparent border-transparent text-chat-text-3'}`}
                onClick={() => props.data.setPlane(entry.plane, !props.data.plane(entry.plane))}
                data-conciv-key="_UEdTg"
              >
                <span data-conciv-key="tCHV6g">{entry.label}</span>
              </button>
            )}
          </For>
        </div>
      </div>
      <div class="flex flex-col gap-0.5" data-conciv-key="aUSh_Q">
        <span
          class="text-[length:var(--chat-text-xs)] text-chat-text-3 tracking-wide font-semibold"
          data-conciv-key="8kQgpQ"
        >
          SHOWN ON THE DOM PLANE
        </span>
        <For each={props.data.legend()}>
          {(entry) => (
            <div
              class={`text-[length:var(--chat-text-md)] px-2 py-1 rounded-chat-surface-sm flex gap-2 items-center ${entry.kind === 'matched' ? '' : 'bg-chat-fill-soft'}`}
              data-conciv-key="1fVprA"
            >
              <svg
                viewBox="0 0 8 8"
                aria-hidden="true"
                class="shrink-0 size-2"
                style={{fill: `var(--xray-${entry.kind})`}}
                data-conciv-key="iaxJLw"
              >
                <circle cx="4" cy="4" r="4" data-conciv-key="St4B5w" />
              </svg>
              <span class="text-chat-text grow" data-conciv-key="cF5nVQ">
                {entry.kind}
              </span>
              <span class="text-chat-text-3 font-chat-mono" data-conciv-key="Bm85iA">
                {entry.count}
              </span>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
