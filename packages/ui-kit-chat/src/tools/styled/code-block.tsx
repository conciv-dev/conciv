import {createMemo, Show, splitProps, type JSX} from 'solid-js'
import {cva} from 'class-variance-authority'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import ChevronUp from 'lucide-solid/icons/chevron-up'
import ChevronsDownUp from 'lucide-solid/icons/chevrons-down-up'
import ChevronsUpDown from 'lucide-solid/icons/chevrons-up-down'
import {Button, ClipboardCopyButton, TooltipIconButton, type ClipboardCopyLabels} from '@conciv/ui-kit-system'
import {SolidCodeBlock, SolidFileDiff, type FileDiffOptions} from '@conciv/solid-diffs'
import {
  codeBlockOptions,
  codeBlockFileChromeOptions,
  codeBlockTitledOptions,
  codeLineOptions,
  FILE_HEADER_CSS,
} from '../primitives/tool-presentation.js'
import {countLabel} from '../primitives/tool-row.js'
import {CLAMP_LINES, ClampFade, createClamp, type Clamp, type TraceClampSize} from '../../styled/trace/clamp.js'
import {codeTheme} from '../../theme/code-theme.js'

function blessedDiffOptions(): FileDiffOptions<undefined, undefined> {
  return {
    theme: codeTheme(),
    themeType: 'system',
    diffStyle: 'unified',
    overflow: 'wrap',
    unsafeCSS: FILE_HEADER_CSS,
  }
}

export const SUNKEN_SURFACE = 'bg-chat-sunken border border-chat-line-soft rounded-chat-sm'

const PAINTLESS_HIGHLIGHT = '[--shiki-background:transparent]'

const BOX =
  'relative block w-full min-w-0 overflow-hidden bg-chat-sunken border rounded-chat-sm [--clamp-fade-from:var(--chat-sunken)]'
const BOX_TONE: Record<CodeBlockTone, string> = {
  normal: 'border-chat-line-soft',
  error: 'border-chat-danger-line',
}
const VIEWPORT = 'relative min-w-0 overflow-hidden'
const CORNER_ACTIONS = 'absolute top-1 end-1 z-2 flex items-center gap-0.5'
const HEADER_ACTIONS = 'flex flex-none items-center gap-0.5'
const ACTION_BUTTON = 'size-6 shrink-0'
const EXPAND_BUTTON = 'h-6 [font-family:var(--chat-mono)] tabular-nums'
const EXPAND_ICON = 'size-3.5'
const HEADER_ROW =
  'box-border flex items-center gap-2 min-w-0 h-8 ps-3 pe-1 bg-chat-fill border-b border-chat-line-soft'
const HEADER_TEXT: Record<CodeBlockTone, string> = {
  normal: 'flex-1 min-w-0 truncate text-chat-xs leading-4 [font-family:var(--chat-mono)] text-chat-text-2',
  error: 'flex-1 min-w-0 truncate text-chat-xs leading-4 [font-family:var(--chat-mono)] text-chat-danger',
}

const TEXT_SIZE = {
  xs: 'text-[length:var(--chat-text-xs)] leading-[var(--chat-trace-gutter)]',
  sm: 'text-[length:var(--chat-text-sm)]',
}

const CAP: Record<'headed' | 'plain', Record<TraceClampSize, string>> = {
  headed: {default: '[max-height:calc(2.5rem+11lh)]', tall: '[max-height:calc(2.5rem+17lh)]'},
  plain: {default: '[max-height:11lh]', tall: '[max-height:17lh]'},
}

type CodeBlockTone = 'normal' | 'error'

type CodeChrome = 'plain' | 'file' | 'titled' | 'line'

type HeightCap = 'result' | 'log' | 'none'

const CLAMP_SIZE: Record<Exclude<HeightCap, 'none'>, TraceClampSize> = {result: 'default', log: 'tall'}

const HEADED_GAP = '[--diffs-gap-block:0.5rem]'

const codeBlock = cva(`block w-full min-w-0 ${PAINTLESS_HIGHLIGHT} [font-family:var(--chat-mono)]`, {
  variants: {
    size: TEXT_SIZE,
    chrome: {
      plain: 'pe-14 [--diffs-gap-block:0px] [--diffs-gap-inline:0px]',
      file: HEADED_GAP,
      titled: HEADED_GAP,
      line: 'overflow-auto whitespace-nowrap [--diffs-gap-block:0px] [--diffs-gap-inline:0px]',
    },
  },
  defaultVariants: {size: 'xs', chrome: 'plain'},
})

const diffBlock = cva(`block w-full min-w-0 ${PAINTLESS_HIGHLIGHT} ${HEADED_GAP} [font-family:var(--chat-mono)]`, {
  variants: {size: TEXT_SIZE},
  defaultVariants: {size: 'xs'},
})

type CodeCopy = {
  labels?: Partial<ClipboardCopyLabels>
  resetMs?: number
  writeText?: (text: string) => Promise<void>
}

type OverflowLabel = (hiddenLines: number) => string

function linesLabel(hiddenLines: number): string {
  return countLabel(hiddenLines, 'more line', 'more lines')
}

function expandLabel(clamp: Clamp, overflowLabel: OverflowLabel | undefined): string {
  return clamp.expanded() ? 'Show less' : (overflowLabel ?? linesLabel)(clamp.hiddenLines())
}

function HeaderExpand(props: {clamp: Clamp; overflowLabel?: OverflowLabel}): JSX.Element {
  return (
    <Button
      variant="ghost"
      size="xs"
      class={EXPAND_BUTTON}
      aria-expanded={props.clamp.expanded()}
      onClick={() => props.clamp.toggle()}
    >
      <Show when={props.clamp.expanded()} fallback={<ChevronDown class={EXPAND_ICON} aria-hidden="true" />}>
        <ChevronUp class={EXPAND_ICON} aria-hidden="true" />
      </Show>
      {expandLabel(props.clamp, props.overflowLabel)}
    </Button>
  )
}

function CornerExpand(props: {clamp: Clamp}): JSX.Element {
  return (
    <TooltipIconButton
      tooltip={expandLabel(props.clamp, undefined)}
      class={ACTION_BUTTON}
      aria-expanded={props.clamp.expanded()}
      onClick={() => props.clamp.toggle()}
    >
      <Show when={props.clamp.expanded()} fallback={<ChevronsUpDown class={EXPAND_ICON} aria-hidden="true" />}>
        <ChevronsDownUp class={EXPAND_ICON} aria-hidden="true" />
      </Show>
    </TooltipIconButton>
  )
}

function BlockActions(props: {
  clamp: Clamp
  text: string
  corner: boolean
  copy?: CodeCopy
  overflowLabel?: OverflowLabel
  extra?: JSX.Element
}): JSX.Element {
  return (
    <div class={props.corner ? CORNER_ACTIONS : HEADER_ACTIONS}>
      <Show when={props.clamp.overflowing() || props.clamp.expanded()}>
        <Show when={props.corner} fallback={<HeaderExpand clamp={props.clamp} overflowLabel={props.overflowLabel} />}>
          <CornerExpand clamp={props.clamp} />
        </Show>
      </Show>
      <ClipboardCopyButton
        text={props.text}
        class={ACTION_BUTTON}
        labels={props.copy?.labels}
        resetMs={props.copy?.resetMs}
        writeText={props.copy?.writeText}
      />
      {props.extra}
    </div>
  )
}

export function CodeHeader(props: {title: string; tone?: CodeBlockTone; children: JSX.Element}): JSX.Element {
  return (
    <div class={HEADER_ROW}>
      <span class={HEADER_TEXT[props.tone ?? 'normal']}>{props.title}</span>
      {props.children}
    </div>
  )
}

export function CodeFrame(props: {
  label: string
  text: string
  lines?: number
  cap: HeightCap
  headed: boolean
  tone?: CodeBlockTone
  size?: 'xs' | 'sm'
  copy?: CodeCopy
  overflowLabel?: OverflowLabel
  extraActions?: JSX.Element
  class?: string
  children: (actions: () => JSX.Element) => JSX.Element
}): JSX.Element {
  const size = (): TraceClampSize => (props.cap === 'none' ? 'default' : CLAMP_SIZE[props.cap])
  const clamp = createClamp({
    lines: () => (props.cap === 'none' ? 0 : (props.lines ?? props.text.split('\n').length)),
    shownLines: () => CLAMP_LINES[size()],
  })
  const capClass = () => CAP[props.headed ? 'headed' : 'plain'][size()]
  const viewportClass = () => (props.cap === 'none' || clamp.expanded() ? VIEWPORT : `${VIEWPORT} ${capClass()}`)
  const actions = (): JSX.Element => (
    <BlockActions
      clamp={clamp}
      text={props.text}
      corner={!props.headed}
      copy={props.copy}
      overflowLabel={props.overflowLabel}
      extra={props.extraActions}
    />
  )
  return (
    <div
      class={`${BOX}  ${BOX_TONE[props.tone ?? 'normal']}  ${TEXT_SIZE[props.size ?? 'xs']}  ${props.class ?? ''}`}
      role="group"
      aria-label={props.label}
      data-code-surface=""
    >
      <Show when={!props.headed}>{actions()}</Show>
      <div ref={clamp.mountViewport} class={viewportClass()}>
        <div ref={clamp.observeContent} class="min-w-0">
          {props.children(actions)}
        </div>
        <ClampFade clamp={clamp} />
      </div>
    </div>
  )
}

export function CodeBlock(props: {
  file: {name: string; lang?: string; contents: string}
  size?: 'xs' | 'sm'
  maxHeight?: HeightCap
  chrome?: 'plain' | 'file' | 'line'
  title?: string
  tone?: CodeBlockTone
  label?: string
  class?: string
}): JSX.Element {
  const [local] = splitProps(props, ['file', 'size', 'maxHeight', 'chrome', 'title', 'tone', 'label', 'class'])
  const chrome = (): CodeChrome => {
    const requested = local.chrome ?? 'plain'
    return requested === 'plain' && local.title !== undefined ? 'titled' : requested
  }
  const codeClass = (): string => codeBlock({size: local.size ?? 'xs', chrome: chrome()})
  const options = createMemo(() => {
    if (chrome() === 'line') return codeLineOptions()
    if (chrome() === 'titled') return codeBlockTitledOptions()
    return chrome() === 'plain' ? codeBlockOptions() : codeBlockFileChromeOptions()
  })
  return (
    <Show
      when={chrome() !== 'line'}
      fallback={<SolidCodeBlock class={`${codeClass()}  ${local.class ?? ''}`} options={options()} file={local.file} />}
    >
      <CodeFrame
        label={local.label ?? local.title ?? local.file.name}
        text={local.file.contents}
        cap={local.maxHeight ?? 'result'}
        headed={chrome() !== 'plain'}
        tone={local.tone}
        size={local.size}
        class={local.class}
      >
        {(actions) => (
          <SolidCodeBlock
            class={codeClass()}
            options={options()}
            file={local.file}
            headerMetadata={chrome() === 'file' ? actions() : undefined}
            customHeader={
              chrome() === 'titled' ? (
                <CodeHeader title={local.title ?? ''} tone={local.tone}>
                  {actions()}
                </CodeHeader>
              ) : undefined
            }
          />
        )}
      </CodeFrame>
    </Show>
  )
}

export function diffBlockClass(size: 'xs' | 'sm' = 'xs', class_?: string): string {
  return `${diffBlock({size})} max-h-80 overflow-auto ${SUNKEN_SURFACE} ${class_ ?? ''}`
}

export function DiffBlock(props: {
  file: {name: string; before: string; after: string; lang?: string}
  size?: 'xs' | 'sm'
  class?: string
}): JSX.Element {
  const [local] = splitProps(props, ['file', 'size', 'class'])
  const diffOptions = createMemo(blessedDiffOptions)
  const oldFile = (): {name: string; contents: string; lang?: string} => ({
    name: local.file.name,
    contents: local.file.before,
    lang: local.file.lang,
  })
  const newFile = (): {name: string; contents: string; lang?: string} => ({
    name: local.file.name,
    contents: local.file.after,
    lang: local.file.lang,
  })
  return (
    <CodeFrame label={local.file.name} text={local.file.after} cap="log" headed size={local.size} class={local.class}>
      {(actions) => (
        <SolidFileDiff
          class={diffBlock({size: local.size ?? 'xs'})}
          options={diffOptions()}
          oldFile={oldFile()}
          newFile={newFile()}
          headerMetadata={actions()}
        />
      )}
    </CodeFrame>
  )
}
