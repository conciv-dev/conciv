import {For, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import ArrowLeft from 'lucide-solid/icons/arrow-left'
import {getExtensionApi} from '@conciv/extension'
import {Button, TooltipIconButton} from '@conciv/ui-kit-system'
import type {Box} from '../shared/defs.js'
import type {createXrayData} from './data.js'
import type {createXrayState} from './state.js'
import type {createXrayView} from './view.js'

export function Card(props: {
  xray: ReturnType<typeof createXrayState>
  data: ReturnType<typeof createXrayData>
  entry: Entry
  target: string
  round: number
}): JSX.Element {
  const openEditor = getExtensionApi(DESIGN_EXTENSION_NAME).useOpenEditor()
  const [label, setLabel] = createStore<{phase: 'idle' | 'saving' | 'saved' | 'failed'; said: string}>({
    phase: 'idle',
    said: '',
  })
  const mark = (input: {node: string; verdict: 'right' | 'wrong'}): void => {
    setLabel({phase: 'saving', said: ''})
    props.data.label({target: props.target, round: props.round, id: props.entry.node.id, ...input}).then(
      () => setLabel({phase: 'saved', said: `${input.node} marked ${input.verdict}.`}),
      (error: unknown) => setLabel({phase: 'failed', said: `The label was not stored: ${String(error)}`}),
    )
  }
  return (
    <aside
      aria-label="Design x-ray card"
      aria-live="polite"
      style={{'view-transition-name': 'xray-card'}}
      class="px-3 py-2 flex flex-col gap-3"
    >
      <header class="flex gap-1 items-center">
        <TooltipIconButton tooltip="Back to the round" class="size-8" onClick={() => props.xray.pickId(null)}>
          <ArrowLeft class="size-4 block" aria-hidden="true" />
        </TooltipIconButton>
        <h3 class="text-sm text-chat-text-hi font-medium m-0 truncate">{props.entry.name}</h3>
        <span class="text-xs text-chat-text-3 font-chat-mono">{props.entry.node.id}</span>
      </header>
      <Section title="FOM">
        <For each={props.entry.node.fom} fallback={<Note>This id has no Figma pair.</Note>}>
          {(pair) => (
            <div class="flex flex-col gap-1">
              <Fields
                fields={[
                  ['node', `${pair.nodeId}${pair.look === null ? '' : ` ${pair.look.name}`}`],
                  ['box', boxText(pair.box)],
                  ...lookFields(pair.look),
                ]}
              />
              <div class="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={label.phase === 'saving'}
                  onClick={() => mark({node: pair.nodeId, verdict: 'right'})}
                >
                  Right pair
                </Button>
                <Button
                  variant="outline-danger"
                  size="sm"
                  disabled={label.phase === 'saving'}
                  onClick={() => mark({node: pair.nodeId, verdict: 'wrong'})}
                >
                  Wrong pair
                </Button>
              </div>
            </div>
          )}
        </For>
        <Show when={label.said !== ''}>
          <Note>{label.said}</Note>
        </Show>
      </Section>
      <Section title="DOM">
        <For each={props.entry.node.dom} fallback={<Note>No element rendered this id in this round.</Note>}>
          {(dom) => (
            <Fields
              fields={[
                ['path', dom.path],
                ['box', boxText(dom.box)],
                ['text', dom.text === '' ? null : dom.text],
                ['drawn', dom.drawn ? 'yes' : 'no'],
                ['kids', String(dom.kids)],
              ]}
            />
          )}
        </For>
      </Section>
      <Section title="CSSOM">
        <For each={props.entry.node.cssom} fallback={<Note>No computed styles are stored for this id.</Note>}>
          {(styles) => (
            <Fields
              fields={[
                ['path', styles.path],
                ['background', styles.background],
                ['color', styles.color],
                ['font', `${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`],
                ['line height', String(styles.lineHeight)],
                ['text align', styles.textAlign],
                ['radius', String(styles.radius)],
                ['border', `${styles.border.width} ${styles.border.style} ${styles.border.color}`],
                ['display', styles.display],
                ['opacity', styles.opacity === undefined ? null : String(styles.opacity)],
              ]}
            />
          )}
        </For>
      </Section>
      <Section title="SRC">
        <Show when={props.entry.node.src.at} fallback={<Note>This id has no source location.</Note>}>
          {(at) => (
            <Button
              variant="link"
              size="bare"
              class="font-chat-mono justify-start"
              onClick={() => openEditor(at().file, at().line)}
            >
              {`${at().file}:${at().line}`}
            </Button>
          )}
        </Show>
        <Fields
          fields={[
            ['element', props.entry.node.src.element],
            ['classes', props.entry.node.src.classes.join(' ') || null],
          ]}
        />
      </Section>
      <Section title="Rows">
        <ul class="m-0 p-0 list-none flex flex-col gap-1">
          <For each={props.entry.rows} fallback={<Note>No rows for this id in this round.</Note>}>
            {(row) => (
              <li class="text-xs">
                <span class="font-chat-mono me-2" style={{color: `var(--xray-${row.kind})`}}>
                  {row.magnitude}
                </span>
                <span class="text-chat-text">{row.text}</span>
              </li>
            )}
          </For>
        </ul>
      </Section>
    </aside>
  )
}

type Entry = NonNullable<ReturnType<ReturnType<typeof createXrayView>['picked']>>

type Look = NonNullable<Entry['node']['fom'][number]['look']>

const DESIGN_EXTENSION_NAME = 'design'

const NOT_STORED = 'not stored'

function lookFields(look: Look | null): [string, string | null][] {
  if (look === null) return [['look', null]]
  return [
    ['fill', bound({value: look.fill, token: look.token_fill})],
    ['fill opacity', numberText(look.fill_opacity)],
    ['font family', look.font_family],
    ['font weight', numberText(look.font_weight)],
    ['font size', numberText(look.font_size)],
    ['line height', numberText(look.line_height)],
    ['radius', bound({value: numberText(look.radius), token: look.token_radius})],
    ['border', bound({value: strokeText(look), token: look.token_stroke})],
    ['opacity', numberText(look.opacity)],
    ['asset', look.asset],
  ]
}

function bound(input: {value: string | null; token: string | null}): string | null {
  if (input.value === null || input.token === null) return input.value
  return `${input.value} (${input.token})`
}

function strokeText(look: Look): string | null {
  if (look.stroke === null) return null
  return look.stroke_weight === null ? look.stroke : `${look.stroke_weight} ${look.stroke}`
}

function numberText(value: number | null): string | null {
  return value === null ? null : String(value)
}

function boxText(box: Box | null): string | null {
  if (box === null) return null
  return `${Math.round(box.x)} ${Math.round(box.y)} ${Math.round(box.w)}×${Math.round(box.h)}`
}

function Section(props: {title: string; children: JSX.Element}): JSX.Element {
  return (
    <section aria-label={props.title} class="pt-2 border-t border-chat-line-soft flex flex-col gap-1">
      <h4 class="text-xs text-chat-text-2 font-medium m-0 uppercase">{props.title}</h4>
      {props.children}
    </section>
  )
}

function Fields(props: {fields: [string, string | null][]}): JSX.Element {
  return (
    <dl class="text-xs m-0 gap-x-2 gap-y-0.5 grid grid-cols-[auto_1fr]">
      <For each={props.fields}>
        {([name, value]) => (
          <>
            <dt class="text-chat-text-3">{name}</dt>
            <dd class="text-chat-text font-chat-mono m-0 break-all">{value ?? NOT_STORED}</dd>
          </>
        )}
      </For>
    </dl>
  )
}

function Note(props: {children: JSX.Element}): JSX.Element {
  return <p class="text-xs text-chat-text-2 m-0">{props.children}</p>
}
