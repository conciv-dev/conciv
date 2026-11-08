import {For, Match, Show, Switch, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import Camera from 'lucide-solid/icons/camera'
import X from 'lucide-solid/icons/x'
import {Button, Slider, TooltipIconButton} from '@conciv/ui-kit-system'
import type {Round} from '../shared/defs.js'
import {Card} from './card.js'
import type {createXrayData} from './data.js'
import type {createXrayState} from './state.js'
import type {createXrayView} from './view.js'

export function Column(props: {
  xray: ReturnType<typeof createXrayState>
  data: ReturnType<typeof createXrayData>
  view: ReturnType<typeof createXrayView>
  capture: () => Promise<boolean>
}): JSX.Element {
  const [capture, setCapture] = createStore<{phase: 'idle' | 'asking' | 'refused' | 'unsupported' | 'held'}>({
    phase: 'idle',
  })
  const askCapture = (): void => {
    setCapture('phase', 'asking')
    props.capture().then(
      (held) => setCapture('phase', held ? 'held' : 'unsupported'),
      () => setCapture('phase', 'refused'),
    )
  }
  return (
    <section
      aria-label="Design x-ray panel"
      style={{'view-transition-name': 'xray-column'}}
      class="overscroll-contain flex flex-col max-w-[calc(100vw-var(--spacing)*12)] w-90 overflow-y-auto"
    >
      <header class="px-3 py-1.5 border-b border-chat-line-soft flex gap-1 items-center">
        <h2 class="text-sm text-chat-text-hi font-medium m-0">Design x-ray</h2>
        <span class="text-xs text-chat-text-3 flex-1 truncate">{shortRef(props.view.target()?.ref ?? '')}</span>
        <TooltipIconButton tooltip="Capture the page pixels" class="size-8" onClick={askCapture}>
          <Camera class="size-4 block" aria-hidden="true" />
        </TooltipIconButton>
        <TooltipIconButton tooltip="Close panel" class="size-8" onClick={() => props.xray.toggleColumn()}>
          <X class="size-4 block" aria-hidden="true" />
        </TooltipIconButton>
      </header>
      <p aria-live="polite" class="text-xs text-chat-text-2 m-0 px-3 empty:hidden">
        {CAPTURE_LINES[capture.phase]}
      </p>
      <Switch fallback={<Line>Loading</Line>}>
        <Match when={props.data.design.error !== undefined}>
          <Line>The design store did not answer: {String(props.data.design.error)}</Line>
        </Match>
        <Match when={props.data.design.latest === null}>
          <Line>No design is registered. Call design_get with the Figma link.</Line>
        </Match>
        <Match when={props.data.design.latest !== undefined && props.view.rounds().length === 0}>
          <Line>No round yet. Call design_check.</Line>
        </Match>
        <Match when={props.view.picked() !== null && props.data.shownRound()}>
          {(round) => (
            <Show when={props.view.picked()}>
              {(entry) => (
                <Card
                  xray={props.xray}
                  data={props.data}
                  entry={entry()}
                  target={props.view.target()?.id ?? ''}
                  round={round().round}
                />
              )}
            </Show>
          )}
        </Match>
        <Match when={props.data.shownRound()}>
          {(round) => <RoundPanel xray={props.xray} data={props.data} view={props.view} round={round()} />}
        </Match>
      </Switch>
    </section>
  )
}

function shortRef(ref: string): string {
  return ref.startsWith('/') ? (ref.split('/').at(-1) ?? ref) : ref
}

const CAPTURE_LINES = {
  idle: '',
  asking: 'Choose this tab in the share prompt.',
  refused: 'The share prompt was dismissed; rounds fall back to snapdom.',
  unsupported: 'This browser cannot crop a tab capture; rounds use snapdom.',
  held: 'Page pixels are captured from the shared tab.',
}

function Line(props: {children: JSX.Element}): JSX.Element {
  return <p class="text-sm text-chat-text-2 m-0 px-3 py-2">{props.children}</p>
}

function RoundPanel(props: {
  xray: ReturnType<typeof createXrayState>
  data: ReturnType<typeof createXrayData>
  view: ReturnType<typeof createXrayView>
  round: Round
}): JSX.Element {
  const position = (): string => {
    const moved = props.view.moved() ? ', page has moved' : ''
    return `round ${props.view.roundPosition()} of ${props.view.rounds().length}${moved}`
  }
  const unsettled = (): number => props.data.design.latest?.unsettled ?? 0
  return (
    <div class="px-3 py-2 flex flex-col gap-3">
      <p class="text-xs text-chat-text-2 m-0 tabular-nums">{position()}</p>
      <Show when={unsettled() > 0}>
        <Line>
          {changes(unsettled())} since the last round; the boxes show where round {props.round.round} measured them.
        </Line>
      </Show>
      <Show when={props.view.rounds().length > 1}>
        <Slider.Root
          min={1}
          max={props.view.rounds().length}
          step={1}
          value={[props.view.roundPosition()]}
          onValueChange={(details) =>
            props.xray.showRound(props.view.rounds()[(details.value[0] ?? 1) - 1]?.round ?? null)
          }
        >
          <Slider.Label>Round</Slider.Label>
          <Slider.Control>
            <Slider.Track>
              <Slider.Range />
            </Slider.Track>
            <Slider.Thumb index={0} aria-label="Round">
              <Slider.HiddenInput />
            </Slider.Thumb>
          </Slider.Control>
        </Slider.Root>
      </Show>
      <Show when={props.view.widths().length > 1}>
        <Slider.Root
          min={0}
          max={props.view.widths().length - 1}
          step={1}
          value={[Math.max(0, props.view.widths().indexOf(props.view.shownWidth()))]}
          onValueChange={(details) => props.xray.showWidth(props.view.widths()[details.value[0] ?? 0] ?? null)}
        >
          <Slider.Label>Width {props.view.shownWidth()}</Slider.Label>
          <Slider.Control>
            <Slider.Track>
              <Slider.Range />
            </Slider.Track>
            <Slider.Thumb index={0} aria-label="Width">
              <Slider.HiddenInput />
            </Slider.Thumb>
          </Slider.Control>
        </Slider.Root>
      </Show>
      <Show when={!props.view.atDesignWidth()}>
        <Line>boxes measured at {props.view.designWidth()}</Line>
      </Show>
      <Summary round={props.round} />
      <ul class="m-0 p-0 list-none flex flex-col">
        <For each={props.view.rows()} fallback={<Line>No rows at this width.</Line>}>
          {(row) => (
            <li class="border-b border-chat-line-soft">
              <Button
                variant="ghost"
                size="none"
                class="text-xs px-1 py-1 text-start gap-2 w-full justify-start"
                disabled={row.id === null}
                onClick={() => props.xray.pickId(row.id)}
              >
                <span class="font-chat-mono shrink-0" style={{color: `var(--xray-${row.kind})`}}>
                  {row.magnitude}
                </span>
                <span class="text-chat-text">{row.text}</span>
              </Button>
            </li>
          )}
        </For>
      </ul>
      <Images file={props.data.file} id={props.view.target()?.id ?? ''} round={props.round.round} />
    </div>
  )
}

const PLURALS = new Intl.PluralRules('en')

const CHANGE_WORDS: Partial<Record<Intl.LDMLPluralRule, string>> = {one: 'page change'}

function changes(count: number): string {
  return `${count} ${CHANGE_WORDS[PLURALS.select(count)] ?? 'page changes'}`
}

function Summary(props: {round: Round}): JSX.Element {
  const counts = (): string => {
    const {much, noticeably, slightly, pins, other} = props.round.counts
    return `${much} much · ${noticeably} noticeably · ${slightly} slightly · ${pins} pins · ${other} other`
  }
  const coverage = (): string => {
    const {nodes, mapped, rendered, missing, dupes} = props.round.coverage
    return `${rendered} of ${nodes} nodes rendered · ${mapped} mapped · ${missing.length} missing · ${dupes.length} twice`
  }
  return (
    <div class="text-xs flex flex-col gap-1 tabular-nums">
      <p class="text-chat-text m-0">{counts()}</p>
      <p class="text-chat-text-2 m-0">{coverage()}</p>
      <Show when={props.round.pixels}>{(pixels) => <p class="text-chat-text-2 m-0">pixels {pixels().share}</p>}</Show>
      <For each={props.round.reflow.results}>
        {(reflow) => (
          <p class="text-chat-text-2 m-0">
            {reflow.width}: {reflow.rows.length} reflow rows ·{' '}
            {reflow.overflowX ? 'scrolls sideways' : 'no sideways scroll'} · root {reflow.rootHeight} tall
          </p>
        )}
      </For>
    </div>
  )
}

function Images(props: {file: (path: string) => string; id: string; round: number}): JSX.Element {
  const [failed, setFailed] = createStore<Record<string, boolean>>({})
  const images = (): {alt: string; path: string}[] => [
    {alt: 'live page', path: `live/${props.id}/${props.round}`},
    {alt: 'pixel difference', path: `diff/${props.id}/${props.round}`},
    {alt: 'design', path: `target/${props.id}`},
  ]
  return (
    <div class="flex flex-col gap-2">
      <For each={images()}>
        {(image) => (
          <Show when={!failed[image.path]} fallback={<Line>The {image.alt} image is not stored.</Line>}>
            <img
              alt={image.alt}
              class="border border-chat-line-soft rounded-chat-surface-sm w-full"
              src={props.file(image.path)}
              onError={() => setFailed(image.path, true)}
            />
          </Show>
        )}
      </For>
    </div>
  )
}
