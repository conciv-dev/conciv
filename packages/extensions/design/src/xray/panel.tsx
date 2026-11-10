import {For, Match, Show, Switch, type Component, type JSX} from 'solid-js'
import Camera from 'lucide-solid/icons/camera'
import X from 'lucide-solid/icons/x'
import type {LucideProps} from 'lucide-solid'
import {
  Button,
  RelativeTime,
  ScrollArea,
  SegmentGroup,
  Slider,
  StatusDot,
  Switch as Toggle,
  Tooltip,
  TooltipIconButton,
  LIST_PANEL_MESSAGE,
  type StatusDotTone,
} from '@conciv/ui-kit-system'
import {Chip} from '@conciv/ui-kit-chat/tools'
import {Card} from './card.js'
import {Parts} from './parts.js'
import type {createXrayData} from './data.js'

export function Panel(props: {
  data: ReturnType<typeof createXrayData>
  close: () => void
  capture: () => Promise<boolean>
}): JSX.Element {
  return (
    <section
      aria-label="Design x-ray"
      class={`pb-4 border border-chat-line border-s-0 border-t-0 bg-chat-glass flex flex-col gap-4 pointer-events-auto start-12 inset-y-0 fixed overflow-hidden ${props.data.showParts() ? 'w-105' : 'w-90'}`}
      data-conciv-key="ovRJEQ"
    >
      <header
        class="px-4 py-2.5 border-b border-chat-line-soft border-solid flex shrink-0 gap-2 items-center"
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
      <Switch fallback={<RoundBody data={props.data} />}>
        <Match when={props.data.showParts()}>
          <Parts data={props.data} />
        </Match>
        <Match when={props.data.stack()}>
          <Scrolled>
            <StackBody data={props.data} />
          </Scrolled>
        </Match>
        <Match when={props.data.card()}>
          {(card) => (
            <Scrolled>
              <Card card={card()} data={props.data} />
            </Scrolled>
          )}
        </Match>
      </Switch>
    </section>
  )
}

const TAGS: Record<string, {label: string; tone: 'neutral' | 'accent' | 'danger'}> = {
  much: {label: 'Wrong', tone: 'danger'},
  noticeably: {label: 'Looks different', tone: 'accent'},
  paint: {label: 'Looks different', tone: 'accent'},
  slightly: {label: 'Off a bit', tone: 'neutral'},
  reflow: {label: 'Reflows', tone: 'neutral'},
  pin: {label: 'Pinned', tone: 'neutral'},
  other: {label: 'Check', tone: 'neutral'},
}

const DOTS: Record<string, StatusDotTone> = {
  much: 'danger',
  noticeably: 'accent',
  paint: 'accent',
  slightly: 'warn',
  matched: 'success',
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

function viewportName(width: number): string {
  return `${VIEWPORT_NAMES.find((entry) => width >= entry.from)?.name ?? ''} ${width}`
}

function HeaderButton(props: {label: string; icon: Component<LucideProps>; onClick: () => void}): JSX.Element {
  return (
    <TooltipIconButton
      tooltip={props.label}
      side="bottom"
      class="p-1.5 size-7"
      onClick={() => props.onClick()}
      data-conciv-key="ogyHWg"
    >
      <props.icon class="size-full block" aria-hidden="true" />
    </TooltipIconButton>
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
        <Slider.Root
          aria-label={['Round']}
          min={first()}
          max={last()}
          step={1}
          value={[shown()]}
          onValueChange={(details) => props.data.pinRound(details.value[0] ?? null)}
          data-conciv-key="snH6Mw"
        >
          <Slider.Control>
            <Slider.Track>
              <Slider.Range />
            </Slider.Track>
            <Slider.Thumb index={0}>
              <Slider.HiddenInput />
            </Slider.Thumb>
          </Slider.Control>
        </Slider.Root>
      </div>
      <div class="flex flex-col gap-2" data-conciv-key="usjwxA">
        <span
          class="text-[length:var(--chat-text-xs)] text-chat-text-3 tracking-wide font-semibold"
          data-conciv-key="-6pWaA"
        >
          PLANES
        </span>
        <div
          role="group"
          aria-label="Planes"
          class="p-0.5 rounded-chat-surface-md bg-chat-fill-soft flex gap-0.5 items-center"
          data-conciv-key="x0BqaA"
        >
          <For each={PLANES}>
            {(entry) => (
              <Button
                variant={props.data.plane(entry.plane) ? 'panel' : 'plain'}
                size="sm"
                aria-pressed={props.data.plane(entry.plane)}
                class={`grow basis-0 ${props.data.plane(entry.plane) ? 'font-semibold' : 'text-chat-text-3'}`}
                onClick={() => props.data.setPlane(entry.plane, !props.data.plane(entry.plane))}
                data-conciv-key="_UEdTg"
              >
                {entry.label}
              </Button>
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
              <StatusDot tone={DOTS[entry.kind] ?? 'dim'} />
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

function Scrolled(props: {children: JSX.Element}): JSX.Element {
  return (
    <ScrollArea.Root class="pe-2 grow min-h-0" data-conciv-key="PnScRt">
      <ScrollArea.Viewport class="size-full [scrollbar-width:none]" data-conciv-key="PnScVp">
        <ScrollArea.Content data-conciv-key="PnScCt">{props.children}</ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar>
        <ScrollArea.Thumb />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  )
}

function RoundBody(props: {data: ReturnType<typeof createXrayData>}): JSX.Element {
  const summary = () => props.data.summary()
  return (
    <div class="px-6 flex grow flex-col gap-5 min-h-0" data-conciv-key="H800hA">
      <Show
        when={props.data.shownRound()?.broken}
        fallback={
          <Show when={summary()}>
            {(sum) => (
              <div class="flex shrink-0 flex-col gap-1 items-stretch" data-conciv-key="OR53IQ">
                <h2 class="text-xl text-chat-text-hi font-semibold m-0" data-conciv-key="zIz5eA">
                  {sum().matching ? 'Matching the design' : 'Not matching yet'}
                </h2>
                <p
                  class="text-[length:var(--chat-text-md)] text-chat-text-2 leading-[calc(var(--chat-space)*4.75)] m-0"
                  data-conciv-key="GvjYag"
                >
                  {sum().problems} problems on {sum().elements} elements. {sum().matched} of {sum().total} elements
                  match the design.
                </p>
              </div>
            )}
          </Show>
        }
      >
        {(broken) => (
          <div class="flex shrink-0 flex-col gap-1 items-stretch" data-conciv-key="DgUr0g">
            <h2 class="text-xl text-chat-text-hi font-semibold m-0" data-conciv-key="C3gLmQ">
              Page does not compile
            </h2>
            <p class="text-xs text-chat-text-2 font-chat-mono m-0" data-conciv-key="6nr1kA">
              {broken()}
            </p>
          </div>
        )}
      </Show>
      <div class="flex shrink-0 gap-2 items-center" data-conciv-key="e3kAnQ">
        <div class="flex gap-0.75 items-center" data-conciv-key="WC9zFg">
          <For each={props.data.history()}>
            {(entry) => (
              <Tooltip.Root>
                <Tooltip.Trigger
                  asChild={(triggerProps) => (
                    <span
                      {...triggerProps()}
                      class={`rounded-sm h-1.5 w-3.5 ${entry.round === props.data.shownRound()?.round ? 'bg-chat-accent' : 'bg-chat-line'}`}
                      data-conciv-key="aeoTvw"
                    />
                  )}
                />
                <Tooltip.Positioner>
                  <Tooltip.Content>{`Check ${entry.round} · ${entry.rows.length} problems`}</Tooltip.Content>
                </Tooltip.Positioner>
              </Tooltip.Root>
            )}
          </For>
        </div>
        <span class="text-xs text-chat-text-2 leading-[calc(var(--chat-space)*4.25)] grow" data-conciv-key="BVkMWA">
          Check {props.data.shownRound()?.round} of {props.data.rounds().at(-1)?.round} ·{' '}
          <RelativeTime value={new Date(props.data.shownRound()?.at ?? Date.now())} />
        </span>
        <Button
          variant="plain"
          size="bare"
          class="text-xs text-chat-text-3 leading-[calc(var(--chat-space)*4.25)]"
          disabled={props.data.earlier() === null}
          onClick={() => props.data.pinRound(props.data.earlier()?.round ?? null)}
          data-conciv-key="AqJd5Q"
        >
          ‹ earlier
        </Button>
      </div>
      <div class="flex shrink-0 flex-col gap-2" data-conciv-key="koIS0g">
        <span
          class="text-[length:var(--chat-text-xs)] text-chat-text-3 tracking-wide font-semibold"
          data-conciv-key="PuX5GQ"
        >
          VIEWPORT
        </span>
        <SegmentGroup.Root
          aria-label="Viewport"
          class="w-full"
          value={`${props.data.viewport() ?? ''}`}
          onValueChange={(details) => details.value !== null && props.data.pickViewport(Number(details.value))}
          data-conciv-key="QBGEVw"
        >
          <SegmentGroup.Indicator />
          <For each={props.data.viewports()}>
            {(width) => (
              <SegmentGroup.Item value={`${width}`} class="text-xs grow basis-0" data-conciv-key="p1vejg">
                <SegmentGroup.ItemText data-conciv-key="ZOXU_A">{viewportName(width)}</SegmentGroup.ItemText>
                <SegmentGroup.ItemHiddenInput />
              </SegmentGroup.Item>
            )}
          </For>
        </SegmentGroup.Root>
      </div>
      <div class="bg-chat-line-soft shrink-0 h-px" data-conciv-key="GkIjPA" />
      <div class="flex flex-col gap-3.5 min-h-0" data-conciv-key="FoJVLQ">
        <span
          class="text-[length:var(--chat-text-xs)] text-chat-text-3 tracking-wide font-semibold shrink-0"
          data-conciv-key="FjWvOw"
        >
          PROBLEMS · {props.data.problems().length}
        </span>
        <Show
          when={props.data.problems().length > 0}
          fallback={
            <p class={`${LIST_PANEL_MESSAGE} m-0 shrink-0`} data-conciv-key="NoPrbl">
              Nothing to fix at this width.
            </p>
          }
        >
          <ScrollArea.Root class="pe-2 flex flex-col min-h-0 -ms-2" data-conciv-key="7zNIiA">
            <ScrollArea.Viewport class="min-h-0 [scrollbar-width:none]" data-conciv-key="PbScVp">
              <ScrollArea.Content data-conciv-key="PbScCt">
                <ul aria-label="Problems" class="m-0 p-0 list-none flex flex-col gap-1" data-conciv-key="PbList">
                  <For each={props.data.problems()}>
                    {(problem) => (
                      <li data-conciv-key="PbItem">
                        <Button
                          variant="ghost"
                          size="none"
                          class="px-2 py-1.5 text-start rounded-chat-surface-sm flex-col gap-1 w-full focus-ring items-stretch"
                          onPointerEnter={() => props.data.hover(problem.node)}
                          onPointerLeave={() => props.data.hover(null)}
                          onFocus={() => props.data.hover(problem.node)}
                          onBlur={() => props.data.hover(null)}
                          onClick={() => {
                            props.data.hover(null)
                            props.data.pickNode(problem.node)
                          }}
                          data-conciv-key="vBKgIg"
                        >
                          <span class="flex gap-2 items-start" data-conciv-key="QnDGfQ">
                            <span class="flex shrink-0 h-5 items-center" data-conciv-key="PbDotB">
                              <StatusDot tone={DOTS[problem.magnitude] ?? 'dim'} />
                            </span>
                            <span
                              class="text-sm text-chat-text-hi leading-5 font-semibold grow w-0 [overflow-wrap:anywhere]"
                              data-conciv-key="VD8MhA"
                            >
                              {problem.name}
                            </span>
                            <span class="flex shrink-0 gap-1.5 items-center" data-conciv-key="PbChps">
                              <Show when={TAGS[problem.magnitude]}>
                                {(tag) => <Chip kind="pill" tone={tag().tone} value={tag().label} class="shrink-0" />}
                              </Show>
                              <Show when={problem.named}>
                                <Chip kind="pill" tone="accent" value="Hand-drawn" class="shrink-0" />
                              </Show>
                              <Show when={problem.drift}>
                                <Chip kind="pill" tone="neutral" value="Token drift" class="shrink-0" />
                              </Show>
                            </span>
                          </span>
                          <For each={problem.lines}>
                            {(line) => (
                              <span
                                class="text-[length:var(--chat-text-md)] text-chat-text leading-[calc(var(--chat-space)*4.75)] block"
                                data-conciv-key="xpnnRQ"
                              >
                                {line}
                              </span>
                            )}
                          </For>
                        </Button>
                      </li>
                    )}
                  </For>
                </ul>
              </ScrollArea.Content>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar>
              <ScrollArea.Thumb />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </Show>
      </div>
      <div class="bg-chat-line-soft shrink-0 h-px" data-conciv-key="04XpPA" />
      <div class="flex shrink-0 flex-col gap-1.5 items-start" data-conciv-key="Qn54kQ">
        <span
          class="text-[length:var(--chat-text-xs)] text-chat-text-3 tracking-wide font-semibold"
          data-conciv-key="Nvp7FA"
        >
          SHOW ON THE PAGE
        </span>
        <For each={SHOWN_LAYERS}>
          {(entry) => (
            <Toggle.Root
              checked={props.data.shown(entry.layer)}
              disabled={entry.layer === 'moved' && props.data.moved() === 0}
              onCheckedChange={(details) => props.data.show(entry.layer, details.checked)}
              data-conciv-key="ZKE1dw"
            >
              <Toggle.Control>
                <Toggle.Thumb />
              </Toggle.Control>
              <Toggle.Label class="data-[state=checked]:text-chat-text" data-conciv-key="UQTc2A">
                {entry.label}
              </Toggle.Label>
              <Toggle.HiddenInput data-conciv-key="3fvaMA" />
            </Toggle.Root>
          )}
        </For>
      </div>
    </div>
  )
}
