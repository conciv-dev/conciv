import {createContext, createMemo, Show, splitProps, useContext, type JSX} from 'solid-js'
import {cva} from 'class-variance-authority'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import ChevronUp from 'lucide-solid/icons/chevron-up'
import ChevronsDownUp from 'lucide-solid/icons/chevrons-down-up'
import ChevronsUpDown from 'lucide-solid/icons/chevrons-up-down'
import {Button, ClipboardCopyButton, TooltipIconButton, type ClipboardCopyLabels} from '@conciv/ui-kit-system'
import {SolidCodeBlock, SolidFileDiff, type FileDiffOptions} from '@conciv/solid-diffs'
import {codeContentOptions, FILE_HEADER_CSS} from '../primitives/tool-presentation.js'
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

const NO_GAPS = '[--diffs-gap-block:0px] [--diffs-gap-inline:0px]'
const HEADED_GAP = '[--diffs-gap-block:0.5rem]'

const BOX =
  'relative block w-full min-w-0 overflow-hidden bg-chat-sunken border rounded-chat-sm [--clamp-fade-from:var(--chat-sunken)]'
const ROOM_FOR_CORNER = '[&>[data-code-corner]~[data-code-viewport]]:pe-14'
const GAPS_UNDER_HEADER =
  '[&>[data-code-header]~[data-code-viewport]]:[--diffs-gap-block:0.5rem] [&>[data-code-header]~[data-code-viewport]]:[--diffs-gap-inline:0.5rem]'
const BOX_TONE: Record<CodeBlockTone, string> = {
  normal: 'border-chat-line-soft',
  error: 'border-chat-danger-line',
}
const VIEWPORT = `relative min-w-0 overflow-hidden ${NO_GAPS}`
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
const CODE_CONTENT = `block w-full min-w-0 ${PAINTLESS_HIGHLIGHT} [font-family:var(--chat-mono)]`
const STANDALONE_LINE = `overflow-auto whitespace-nowrap ${NO_GAPS}`

const TEXT_SIZE = {
  xs: 'text-[length:var(--chat-text-xs)] leading-[var(--chat-trace-gutter)]',
  sm: 'text-[length:var(--chat-text-sm)]',
}

const CAP: Record<'headed' | 'plain', Record<TraceClampSize, string>> = {
  headed: {default: '[max-height:calc(2.5rem+11lh)]', tall: '[max-height:calc(2.5rem+17lh)]'},
  plain: {default: '[max-height:11lh]', tall: '[max-height:17lh]'},
}

type CodeBlockTone = 'normal' | 'error'

type CodeSize = 'xs' | 'sm'

type HeightCap = 'result' | 'log' | 'none'

type CodeFile = {name: string; lang?: string; contents: string}

type OverflowLabel = (hiddenLines: number) => string

const CLAMP_SIZE: Record<Exclude<HeightCap, 'none'>, TraceClampSize> = {result: 'default', log: 'tall'}

const diffBlock = cva(`block w-full min-w-0 ${PAINTLESS_HIGHLIGHT} ${HEADED_GAP} [font-family:var(--chat-mono)]`, {
  variants: {size: TEXT_SIZE},
  defaultVariants: {size: 'xs'},
})

type CodeBlockContextValue = {
  clamp: Clamp
  text: () => string
  tone: () => CodeBlockTone
  size: () => CodeSize
  cap: () => HeightCap
  clampSize: () => TraceClampSize
  overflowLabel: () => OverflowLabel | undefined
}

const CodeBlockContext = createContext<CodeBlockContextValue>()

const HeaderPlacement = createContext(false)

function useCodeBlock(): CodeBlockContextValue {
  const block = useContext(CodeBlockContext)
  if (!block) throw new Error('A CodeBlock part renders inside a CodeBlock')
  return block
}

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

export type CodeBlockProps = {
  text: string
  label: string
  lines?: number
  maxHeight?: HeightCap
  tone?: CodeBlockTone
  size?: CodeSize
  overflowLabel?: OverflowLabel
  class?: string
  children: JSX.Element
}

export function CodeBlock(props: CodeBlockProps): JSX.Element {
  const [local] = splitProps(props, [
    'text',
    'label',
    'lines',
    'maxHeight',
    'tone',
    'size',
    'overflowLabel',
    'class',
    'children',
  ])
  const cap = (): HeightCap => local.maxHeight ?? 'result'
  const clampSize = (): TraceClampSize => {
    const current = cap()
    return current === 'none' ? 'default' : CLAMP_SIZE[current]
  }
  const clamp = createClamp({
    lines: () => (cap() === 'none' ? 0 : (local.lines ?? local.text.split('\n').length)),
    shownLines: () => CLAMP_LINES[clampSize()],
  })
  const block: CodeBlockContextValue = {
    clamp,
    text: () => local.text,
    tone: () => local.tone ?? 'normal',
    size: () => local.size ?? 'xs',
    cap,
    clampSize,
    overflowLabel: () => local.overflowLabel,
  }
  return (
    <CodeBlockContext.Provider value={block}>
      <div
        class={`${BOX}  ${ROOM_FOR_CORNER}  ${GAPS_UNDER_HEADER}  ${BOX_TONE[block.tone()]}  ${TEXT_SIZE[block.size()]}  ${local.class ?? ''}`}
        role="group"
        aria-label={local.label}
        data-code-surface=""
      >
        {local.children}
      </div>
    </CodeBlockContext.Provider>
  )
}

export function CodeBlockHeader(props: {children: JSX.Element}): JSX.Element {
  return (
    <HeaderPlacement.Provider value={true}>
      <div class={HEADER_ROW} data-code-header="">
        {props.children}
      </div>
    </HeaderPlacement.Provider>
  )
}

export function CodeBlockTitle(props: {children: JSX.Element}): JSX.Element {
  const block = useCodeBlock()
  return <span class={HEADER_TEXT[block.tone()]}>{props.children}</span>
}

export function CodeBlockActions(props: {children?: JSX.Element}): JSX.Element {
  const block = useCodeBlock()
  const inHeader = useContext(HeaderPlacement)
  return (
    <div class={inHeader ? HEADER_ACTIONS : CORNER_ACTIONS} data-code-corner={inHeader ? undefined : ''}>
      <Show when={block.clamp.overflowing() || block.clamp.expanded()}>
        <Show when={inHeader} fallback={<CornerExpand clamp={block.clamp} />}>
          <HeaderExpand clamp={block.clamp} overflowLabel={block.overflowLabel()} />
        </Show>
      </Show>
      {props.children}
    </div>
  )
}

export function CodeBlockCopyButton(props: {
  labels?: Partial<ClipboardCopyLabels>
  resetMs?: number
  writeText?: (text: string) => Promise<void>
}): JSX.Element {
  const block = useCodeBlock()
  return (
    <ClipboardCopyButton
      text={block.text()}
      class={ACTION_BUTTON}
      labels={props.labels}
      resetMs={props.resetMs}
      writeText={props.writeText}
    />
  )
}

export function CodeBlockViewport(props: {headed?: boolean; children: JSX.Element}): JSX.Element {
  const block = useCodeBlock()
  const capClass = () => CAP[props.headed === true ? 'headed' : 'plain'][block.clampSize()]
  const viewportClass = () =>
    block.cap() === 'none' || block.clamp.expanded() ? VIEWPORT : `${VIEWPORT} ${capClass()}`
  return (
    <div ref={block.clamp.mountViewport} class={viewportClass()} data-code-viewport="">
      <div ref={block.clamp.observeContent} class="min-w-0">
        {props.children}
      </div>
      <ClampFade clamp={block.clamp} />
    </div>
  )
}

export function CodeBlockContent(props: {file: CodeFile; wrap?: boolean; lineNumbers?: boolean}): JSX.Element {
  const block = useContext(CodeBlockContext)
  const options = createMemo(() =>
    codeContentOptions({wrap: props.wrap ?? true, lineNumbers: props.lineNumbers ?? false}),
  )
  return (
    <Show
      when={block}
      fallback={
        <SolidCodeBlock
          class={`${CODE_CONTENT}  ${TEXT_SIZE.xs}  ${STANDALONE_LINE}`}
          options={options()}
          file={props.file}
        />
      }
    >
      {(current) => (
        <CodeBlockViewport>
          <SolidCodeBlock
            class={`${CODE_CONTENT}  ${TEXT_SIZE[current().size()]}`}
            options={options()}
            file={props.file}
          />
        </CodeBlockViewport>
      )}
    </Show>
  )
}

export function diffBlockClass(size: CodeSize = 'xs', class_?: string): string {
  return `${diffBlock({size})} max-h-80 overflow-auto ${SUNKEN_SURFACE} ${class_ ?? ''}`
}

export function DiffBlock(props: {
  file: {name: string; before: string; after: string; lang?: string}
  size?: CodeSize
  class?: string
}): JSX.Element {
  const [local] = splitProps(props, ['file', 'size', 'class'])
  const diffOptions = createMemo(blessedDiffOptions)
  const oldFile = (): CodeFile => ({name: local.file.name, contents: local.file.before, lang: local.file.lang})
  const newFile = (): CodeFile => ({name: local.file.name, contents: local.file.after, lang: local.file.lang})
  return (
    <CodeBlock label={local.file.name} text={local.file.after} maxHeight="log" size={local.size} class={local.class}>
      <CodeBlockViewport headed>
        <SolidFileDiff
          class={diffBlock({size: local.size ?? 'xs'})}
          options={diffOptions()}
          oldFile={oldFile()}
          newFile={newFile()}
          headerMetadata={
            <HeaderPlacement.Provider value={true}>
              <CodeBlockActions>
                <CodeBlockCopyButton />
              </CodeBlockActions>
            </HeaderPlacement.Provider>
          }
        />
      </CodeBlockViewport>
    </CodeBlock>
  )
}
