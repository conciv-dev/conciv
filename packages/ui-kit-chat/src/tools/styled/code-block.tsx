import {createMemo, Show, splitProps, type JSX} from 'solid-js'
import {cva} from 'class-variance-authority'
import {ClipboardCopyButton} from '@conciv/ui-kit-system'
import {SolidCodeBlock, SolidFileDiff, type FileDiffOptions} from '@conciv/solid-diffs'
import {
  codeBlockOptions,
  codeBlockFileChromeOptions,
  codeBlockTitledOptions,
  codeLineOptions,
} from '../primitives/tool-presentation.js'
import {useEmbeddedCard} from './card-chrome.js'
import {TraceClamp, type TraceClampSize} from '../../styled/trace/clamp.js'
import {codeTheme} from '../../theme/code-theme.js'

function blessedDiffOptions(): FileDiffOptions<undefined, undefined> {
  return {
    theme: codeTheme(),
    themeType: 'system',
    disableFileHeader: true,
    diffStyle: 'unified',
    overflow: 'wrap',
  }
}

export const SUNKEN_SURFACE = 'bg-chat-sunken border border-chat-line-soft rounded-chat-sm'

const PAINTLESS_HIGHLIGHT = '[--shiki-background:transparent]'

const BOX = 'relative block w-full min-w-0 overflow-hidden bg-chat-sunken border rounded-chat-sm'
const BOX_TONE: Record<CodeBlockTone, string> = {
  normal: 'border-chat-line-soft',
  error: 'border-chat-danger-line',
}
const CORNER_ACTIONS = 'absolute top-1 end-1 z-1 flex'
const ACTION_BUTTON = 'size-6 shrink-0'
const CLAMP_FOOTER = 'px-2 pb-1'
const CLEAR_OF_CORNER = 'pe-8'
const TITLE_ROW = 'flex items-center justify-between gap-2 min-w-0 ps-3 pe-1 py-1'
const TITLE_TEXT: Record<CodeBlockTone, string> = {
  normal: 'min-w-0 truncate text-chat-xs font-chat text-chat-text-2',
  error: 'min-w-0 truncate text-chat-xs font-chat text-chat-danger',
}

type CodeBlockTone = 'normal' | 'error'

type CodeChrome = 'plain' | 'file' | 'titled' | 'line'

type HeightCap = 'result' | 'log' | 'none'

const CLAMP_SIZE: Record<Exclude<HeightCap, 'none'>, TraceClampSize> = {result: 'default', log: 'tall'}

const codeBlock = cva(`block w-full min-w-0 ${PAINTLESS_HIGHLIGHT} [font-family:var(--chat-mono)]`, {
  variants: {
    size: {
      xs: 'text-[length:var(--chat-text-xs)] leading-[var(--chat-trace-gutter)]',
      sm: 'text-[length:var(--chat-text-sm)]',
    },
    chrome: {
      plain: `${CLEAR_OF_CORNER} [--diffs-gap-block:0px] [--diffs-gap-inline:0px]`,
      file: '',
      titled: '',
      line: 'overflow-auto whitespace-nowrap [--diffs-gap-block:0px] [--diffs-gap-inline:0px]',
    },
  },
  defaultVariants: {size: 'xs', chrome: 'plain'},
})

const diffBlock = cva(`block w-full min-w-0 ${PAINTLESS_HIGHLIGHT} [font-family:var(--chat-mono)]`, {
  variants: {
    size: {
      xs: 'text-[length:var(--chat-text-xs)] leading-[var(--chat-trace-gutter)]',
      sm: 'text-[length:var(--chat-text-sm)]',
    },
  },
  defaultVariants: {size: 'xs'},
})

function CopyAction(props: {text: string}): JSX.Element {
  return <ClipboardCopyButton text={props.text} class={ACTION_BUTTON} />
}

function BlockFrame(props: {
  label: string
  text: string
  cap: HeightCap
  cornerCopy: boolean
  tone?: CodeBlockTone
  class?: string
  children: JSX.Element
}): JSX.Element {
  const lines = () => props.text.split('\n').length
  return (
    <div
      class={`${BOX}  ${BOX_TONE[props.tone ?? 'normal']}  ${props.class ?? ''}`}
      role="group"
      aria-label={props.label}
    >
      <Show when={props.cornerCopy}>
        <div class={CORNER_ACTIONS}>
          <CopyAction text={props.text} />
        </div>
      </Show>
      <Show when={props.cap !== 'none' && props.cap} fallback={props.children}>
        {(cap) => (
          <TraceClamp size={CLAMP_SIZE[cap()]} lines={lines()} footerClass={CLAMP_FOOTER}>
            {props.children}
          </TraceClamp>
        )}
      </Show>
    </div>
  )
}

function useHeightCap(requested: () => HeightCap | undefined): () => HeightCap {
  const embedded = useEmbeddedCard()
  return () => (embedded() ? 'none' : (requested() ?? 'result'))
}

function TitleRow(props: {title: string; tone: CodeBlockTone; text: string}): JSX.Element {
  return (
    <div class={TITLE_ROW}>
      <span class={TITLE_TEXT[props.tone]}>{props.title}</span>
      <CopyAction text={props.text} />
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
  const cap = useHeightCap(() => local.maxHeight)
  const codeClass = (): string => codeBlock({size: local.size ?? 'xs', chrome: chrome()})
  const options = createMemo(() => {
    if (chrome() === 'line') return codeLineOptions()
    if (chrome() === 'titled') return codeBlockTitledOptions()
    return chrome() === 'plain' ? codeBlockOptions() : codeBlockFileChromeOptions()
  })
  const headerCopy = (): JSX.Element => (chrome() === 'file' ? <CopyAction text={local.file.contents} /> : undefined)
  const titleRow = (): JSX.Element => {
    const title = local.title
    if (chrome() !== 'titled' || title === undefined) return undefined
    return <TitleRow title={title} tone={local.tone ?? 'normal'} text={local.file.contents} />
  }
  return (
    <Show
      when={chrome() !== 'line'}
      fallback={<SolidCodeBlock class={`${codeClass()}  ${local.class ?? ''}`} options={options()} file={local.file} />}
    >
      <BlockFrame
        label={local.label ?? local.title ?? local.file.name}
        text={local.file.contents}
        cap={cap()}
        cornerCopy={chrome() === 'plain'}
        tone={local.tone}
        class={local.class}
      >
        <SolidCodeBlock
          class={codeClass()}
          options={options()}
          file={local.file}
          headerMetadata={headerCopy()}
          customHeader={titleRow()}
        />
      </BlockFrame>
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
  const cap = useHeightCap(() => 'log')
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
    <BlockFrame label={local.file.name} text={local.file.after} cap={cap()} cornerCopy class={local.class}>
      <SolidFileDiff
        class={`${diffBlock({size: local.size ?? 'xs'})}  ${CLEAR_OF_CORNER}`}
        options={diffOptions()}
        oldFile={oldFile()}
        newFile={newFile()}
      />
    </BlockFrame>
  )
}
